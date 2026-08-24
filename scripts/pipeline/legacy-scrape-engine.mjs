import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import * as cheerio from "cheerio";
import slugify from "slugify";
import * as XLSX from "xlsx";

installPdfJsGeometryPolyfills();

import { addCoverageMetadata } from "../coverage-gate.mjs";
import {
  getBrandAdapter,
  registerBrandAdapterSource,
} from "../restaurant-adapters.mjs";
import {
  classifyDocumentLink,
  configuredUrlAuditForSource,
  normalizeConfiguredSourceUrls,
  officialItemCountForRestaurant,
  officialStatusForSource,
  remediationBucketForStatus,
} from "../restaurant-source-classification.mjs";
import { sharedParserTypes } from "../restaurant-adapters/shared-parser-types.mjs";
import {
  classifyMenuItemRow,
  sanitizeMenuItemDisplayFields,
} from "../menu-item-quality.mjs";

const runtimeImport = new Function("specifier", "return import(specifier)");
const execFile = promisify(execFileCallback);
let pdfjsLibPromise = null;
let pdfParsePromise = null;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const defaultRawDir = path.join(projectRoot, "data/scraped/raw");
const runDate = new Date().toISOString();
const rawDate = runDate.slice(0, 10);

const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_5) AppleWebKit/605.1.15 allergy-app-menu-pipeline/1.0";
const browserUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const browserFetchRestaurantIds = new Set([
  "applebees",
  "alero-dupont-dc",
  "all-about-burger-glover-park-dc",
  "arenas-georgetown-dc",
  "atlas-and-andys-pizza-navy-yard-dc",
  "bombay-street-food-capitol-hill-dc",
  "boru-ramen-arlington-dc-metro",
  "bukom-cafe-dc",
  "buffalo-bergen-capitol-hill-dc",
  "buffalo-bergen-cleveland-park-dc",
  "buffalo-bergen-union-market-dc",
  "bund-up-union-market-dc",
  "burnin-bird-dc",
  "billy-hicks-georgetown-dc",
  "boogy-and-peel-dupont-dc",
  "booeymonger-friendship-heights-dc",
  "bethesda-bagels-navy-yard-dc",
  "bethesda-bagels-wildwood-dc-metro",
  "bangkok-54-arlington-dc-metro",
  "barrel-and-crow-bethesda-dc-metro",
  "barca-pier-and-wine-bar-alexandria-va-dc-metro",
  "brass-rabbit-clarendon-dc-metro",
  "canton-disco-dc",
  "capo-deli-foggy-bottom-dc",
  "cafesano-reston-dc-metro",
  "chicken-and-whiskey-14th-dc",
  "chloez-cafe-fairfax-station-dc-metro",
  "claudios-table-dc",
  "clydes-georgetown-dc",
  "columbia-firehouse-alexandria-dc-metro",
  "dairy-queen",
  "dlena-dc",
  "dupont-italian-kitchen-dc",
  "el-mariachi-rockville-dc-metro",
  "flor-coffee-books-georgetown-dc",
  "famous-toastery-ashburn-dc-metro",
  "fossette-focacceria-union-market-dc",
  "georges-falafel-georgetown-dc",
  "golden-corral",
  "gringos-and-mariachis-bethesda-dc-metro",
  "gypsy-kitchen-dc",
  "highlands-dc",
  "ihop",
  "iron-rooster-college-park-dc-metro",
  "k-wings-centreville-dc-metro",
  "la-casita-gaithersburg-dc-metro",
  "joia-burger-dc",
  "pitango-adams-morgan-dc",
  "junction-capitol-hill-dc",
  "luchador-la-cosecha-dc",
  "lupo-verde-osteria-dc",
  "lupo-marino-dc",
  "king-street-oyster-noma-dc",
  "la-bonne-vache-dc",
  "la-casina-capitol-hill-dc",
  "grace-street-georgetown-dc",
  "lebanese-taverna-silver-spring-dc-metro",
  "llamabar-navy-yard-dc",
  "little-engine-dc",
  "madhatter-dc",
  "matisse-dc",
  "mikey-and-mels-deli-dc",
  "mi-vida-wharf-dc",
  "milk-and-honey-h-street-dc",
  "milk-and-honey-silver-spring-dc-metro",
  "mama-chepa-dc",
  "mamma-lucia-fallsgrove-dc-metro",
  "mezcal-cantina-dc",
  "nicks-pizza-petworth-dc",
  "ninety-second-pizza-georgetown-dc",
  "noma-pizza-dc",
  "paraiso-dc",
  "pearl-street-warehouse-dc",
  "pork-barrel-bbq-alexandria-dc-metro",
  "pho-towda-vienna-dc-metro",
  "pike-restaurant-arlington-dc-metro",
  "cafe-colline-arlington-dc-metro",
  "cava-mezze-rockville-dc-metro",
  "chef-tonys-rockville-dc-metro",
  "corned-beef-king-rockville-dc-metro",
  "georgetown-bagelry-bethesda-dc-metro",
  "problem-child-navy-yard-dc",
  "prost-dc",
  "pupatella-capitol-hill-dc",
  "quincys-gaithersburg-dc-metro",
  "quincy-hall-arlington-dc-metro",
  "qdoba",
  "ramen-menri-bethesda-dc-metro",
  "red-lobster",
  "redrocks-old-town-alexandria-dc-metro",
  "rus-uz-arlington-dc-metro",
  "royal-restaurant-alexandria-dc-metro",
  "rocklands-bbq-dc",
  "roaming-rooster-skyland-dc",
  "roll-play-falls-church-dc-metro",
  "shake-shack",
  "sheesh-chantilly-dc-metro",
  "sicilian-pizza-h-street-dc",
  "slice-and-pie-14th-dc",
  "stans-dc",
  "sweet-crimes-bakery-dc",
  "sweet-leaf-mclean-dc-metro",
  "saya-saltena-dc",
  "starbucks",
  "steak-n-egg-tenleytown-dc",
  "takumi-navy-yard-dc",
  "taco-bamba-ballston-dc-metro",
  "taco-bamba-fair-lakes-dc-metro",
  "taco-bamba-gaithersburg-dc-metro",
  "taco-bamba-herndon-dc-metro",
  "taco-bamba-rockville-dc-metro",
  "taco-bamba-shirlington-dc-metro",
  "taco-bamba-sterling-dc-metro",
  "taco-bamba-vienna-dc-metro",
  "texas-roadhouse",
  "the-diner-adams-morgan-dc",
  "the-breakfast-club-silver-spring-dc-metro",
  "the-coupe-dc",
  "the-upper-room-dc",
  "the-burger-shack-ashburn-dc-metro",
  "dyfres-burger-springfield-dc-metro",
  "thompson-italian-falls-church-dc-metro",
  "taco-bamba-springfield-dc-metro",
  "tandoori-nights-gaithersburg-dc-metro",
  "angry-jerk-silver-spring-dc-metro",
  "ama-dc",
  "guacado-laurel-dc-metro",
  "kiin-imm-thai-rockville-dc-metro",
  "dosa-and-chaat-gaithersburg-dc-metro",
  "ala-bethesda-dc-metro",
  "tout-de-sweet-bethesda-dc-metro",
  "bon-fresco-rockville-dc-metro",
  "teaism-dupont-dc",
  "taqueria-al-lado-h-street-dc",
  "tortino-dc",
  "tune-inn-dc",
  "yume-sushi-arlington-dc-metro",
  "cafe-pizzaiolo-alexandria-dc-metro",
  "cafe-1676-vienna-dc-metro",
  "rustico-alexandria-dc-metro",
  "roots-cafe-mclean-dc-metro",
  "republic-cantina-dc",
  "mid-atlantic-seafood-hyattsville-dc-metro",
  "side-door-pizza-dc",
  "sonnys-pizza-dc",
  "timber-pizza-mclean-dc-metro",
  "villa-yara-georgetown-dc",
  "walters-sports-bar-navy-yard-dc",
  "yellow-union-market-dc",
  "zinnia-silver-spring-dc-metro",
  "aroma-pizza-lorton-dc-metro",
  "ap-pizza-shop-bethesda-dc-metro",
  "commons-fooderie-reston-dc-metro",
  "mqr-cafe-vienna-dc-metro",
  "the-board-and-brew-college-park-dc-metro",
  "waffle-house",
  "zaxbys",
]);
const tlsFetchPdfRestaurantIds = new Set(["qdoba", "zaxbys"]);

const sourceTypes = {
  allergen: "allergen",
  api: "api",
  menu: "menu",
};

const allergenSourceTypes = {
  officialAllergenMenu: "official-allergen-menu",
  officialIngredients: "official-ingredients",
  officialProductAllergenSection: "official-product-allergen-section",
  unavailable: "unavailable",
};

function installPdfJsGeometryPolyfills() {
  globalThis.DOMMatrix ??= class DOMMatrix {
    constructor(init = [1, 0, 0, 1, 0, 0]) {
      const values = Array.isArray(init) ? init : [1, 0, 0, 1, 0, 0];
      this.a = values[0] ?? 1;
      this.b = values[1] ?? 0;
      this.c = values[2] ?? 0;
      this.d = values[3] ?? 1;
      this.e = values[4] ?? 0;
      this.f = values[5] ?? 0;
    }
  };
  globalThis.DOMPoint ??= class DOMPoint {
    constructor(x = 0, y = 0, z = 0, w = 1) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.w = w;
    }
  };
  globalThis.DOMRect ??= class DOMRect {
    constructor(x = 0, y = 0, width = 0, height = 0) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
    }
  };
  globalThis.ImageData ??= class ImageData {
    constructor(data, width, height) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };
  globalThis.Path2D ??= class Path2D {};
}

async function getPdfJsLib() {
  installPdfJsGeometryPolyfills();
  pdfjsLibPromise ??= runtimeImport("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsLibPromise;
}

async function getPdfParse() {
  installPdfJsGeometryPolyfills();
  pdfParsePromise ??= runtimeImport("pdf-parse");
  return pdfParsePromise;
}

const args = parseArgs(process.argv.slice(2));
const timeoutMs = Number(args["timeout-ms"] ?? 20000);
const productPageLimit = Number(args["product-page-limit"] ?? 20);
const rawDir = path.resolve(args.rawDir ?? defaultRawDir);
const writeRaw =
  args["skip-raw"] !== "true" &&
  (isCliEntry() || process.env.RESTAURANT_PIPELINE_WRITE_RAW === "true");

const allergenTerms = [
  {
    id: "peanut",
    terms: ["peanut", "peanuts", "arachis"],
  },
  {
    id: "tree-nut",
    terms: [
      "tree nut",
      "tree nuts",
      "nut",
      "nuts",
      "almond",
      "almonds",
      "cashew",
      "cashewnut",
      "cashewnuts",
      "cashews",
      "walnut",
      "walnuts",
      "pecan",
      "pecans",
      "pistachio",
      "pistachios",
      "hazelnut",
      "hazelnuts",
      "macadamia",
    ],
  },
  {
    id: "milk",
    terms: [
      "milk",
      "dairy",
      "cheese",
      "cream",
      "butter",
      "buttermilk",
      "whey",
      "casein",
      "lactose",
    ],
  },
  {
    id: "egg",
    terms: ["egg", "eggs", "egg white", "egg yolk", "albumen", "mayonnaise"],
  },
  {
    id: "wheat",
    terms: ["wheat", "flour", "bun", "bread", "breading", "tortilla"],
  },
  {
    id: "gluten",
    terms: ["gluten", "barley", "rye", "malt"],
  },
  {
    id: "soy",
    terms: ["soy", "soybean", "soybeans", "soy lecithin", "tofu", "edamame"],
  },
  {
    id: "sesame",
    terms: ["sesame", "tahini"],
  },
  {
    id: "fish",
    terms: [
      "fish",
      "finfish",
      "seafood",
      "cod",
      "pollock",
      "tuna",
      "salmon",
      "anchovy",
      "anchovies",
      "branzino",
      "hamachi",
      "yellowfin",
      "mackerel",
    ],
  },
  {
    id: "shellfish",
    terms: [
      "shellfish",
      "shrimp",
      "shrimps",
      "prawn",
      "prawns",
      "crab",
      "lobster",
      "crustacean",
      "clam",
      "oyster",
      "mussel",
      "mussels",
      "scallop",
      "scallops",
      "octopus",
      "calamari",
      "squid",
    ],
  },
  {
    id: "mustard",
    terms: ["mustard"],
  },
  {
    id: "sulfites",
    terms: ["sulfite", "sulfites", "sulphite", "sulphites"],
  },
];

const providerAllergenCodes = new Map([
  ["dair", "milk"],
  ["dairy", "milk"],
  ["egg", "egg"],
  ["eggs", "egg"],
  ["fish", "fish"],
  ["glut", "gluten"],
  ["gluten", "gluten"],
  ["milk", "milk"],
  ["must", "mustard"],
  ["mustard", "mustard"],
  ["nut", "tree-nut"],
  ["pean", "peanut"],
  ["peanut", "peanut"],
  ["seafood", "fish"],
  ["sesame", "sesame"],
  ["sesm", "sesame"],
  ["shellfish", "shellfish"],
  ["soy", "soy"],
  ["soyb", "soy"],
  ["sulp", "sulfites"],
  ["sulphites", "sulfites"],
  ["sulfites", "sulfites"],
  ["tree", "tree-nut"],
  ["tree-nut", "tree-nut"],
  ["treenut", "tree-nut"],
  ["wheat", "wheat"],
]);

const subwayPdfColumns = [
  { id: "egg", x: 231 },
  { id: "fish", x: 257 },
  { id: "milk", x: 283 },
  { id: "peanut", x: 309 },
  { id: "sesame", x: 335 },
  { id: "shellfish", x: 361 },
  { id: "soy", x: 387 },
  { id: "tree-nut", x: 413 },
  { id: "wheat", x: 441 },
  { id: "gluten", x: 441 },
  { id: "sulfites", x: 469 },
];

const matrixSectionNames = new Set([
  "Breads & Wraps",
  "Meat, Poultry, Seafood & Eggs",
  "Cheese",
  "Condiments & Dressings",
  "Vegetables",
  "Cookies & Desserts",
]);

const skipNamePatterns = [
  /^(home|menus?|nutrition|allergens?|privacy|terms|careers|locations?|rewards?|order now)$/i,
  /^(calories|carbs|co2e|fat|hidden link|protein|total fat|sodium|sugar)$/i,
  /^(add-on|all-day breakfast|allergy caution|appetizers?|bagels? & muffins|benedicts|bowls?|breakfast|breakfast breads|breakfast\/brunch sides|brew at home|burritos?|cakecups|coffee tea & more|desserts?|dinner|donuts?|drinks?|entrees?|espresso & coffee|food|frozen drinks|handhelds|lunch|nachos|nandinos|party packs|peri-peri chicken|quesadillas?|salads?|sauces?|sides?|snacks & shareables|tacos|teas and more|vegetarian|beverages?)$/i,
  /^(burgers?|fries|hot dogs?|sandwiches|shakes|toppings)$/i,
  /^(all locations|bar menu|book a space|books|breakfast & brunch menu|catering menu|coffee, tea, sodas? & juices|coffee, tea, soda,? & juices|dessert menu|happy hour menu|kids menu|lunch & dinner menu)$/i,
  /^advance orders(?:\s*-\s*.+)?$/i,
  /^(accept|cancel|continue|close modal.*|view|learn|download|sign in|log in|skip|skip to .+|return to .+|contact us)$/i,
  /^allergen & nutrition information$/i,
  /^allergen index\b/i,
  /^contains?:/i,
  /^may contain:?/i,
  /^(?:disclaimer|ellipse|hot icon|nutritional calculator)$/i,
  /^(?:all signs|animate it your way|connect multiple accounts|create filters|customi[sz]able business hours|customi[sz]e sign|display weekly business hour|exceptional cases|free sign|get the look you want|mobile ready|set how images|sign animations|sign positioning and scaling|special events|support the devs)$/i,
  /^(?:english|vietnamese)$/i,
  /^menu item\s+protein\b/i,
  /^(?:allergen guide|deals|loyalty)$/i,
  /^allergen guide\s*scan\s+qr\b/i,
  /^@/,
  /^navigate to .+ category$/i,
  /^(facebook|instagram|tiktok|youtube|x|twitter)$/i,
  /\{\{/,
  /\b(accessibility|about|blog|careers?|cart|contact|crew|customer support|delivery|do business|do not sell|faq|franchis\w*|gift cards?|investors?|jobs?|legal|locations?|manage privacy|music|news & stories|press room|privacy|real estate|rewards?|shop|sign in|site map|support hub|terms|track|transparency act|who we are)\b/i,
  /^(five guys|five guys enterprises, llc)$/i,
  /^(begin ordering|crowd pleasers|find a|find jobs|forgot password|join now|learn more|not right now|online ordering|our food|our menu|our story|show hide|start a group order|start (new|your) order|use email|use mypanera)/i,
  /^(add-?ons?(?:\s*[–—-])?|best sellers|combos|extras|explore|explore .+|in-house series|limited time|media faqs|merch|new|omelettes? \/ eggs(?: \/ \"eggs\")?|pancakes & french toast|poetry|signature brunch|specials|starters|trending|upgrades?(?:\s*[–—-])?)$/i,
  /^(?:limited time )?menu offerings\.?$/i,
  /^(burgers? & sammies|curry rice bowls|dishes & rice|hummus bowls|more shawarma|more sides & sauces|pita sandwiches|sarnies)$/i,
  /^(?:à la carte|aperitivo|entr[ée]e|main course|pasta|table)$/i,
  /^newsletter sign up$/i,
  /^take out$/i,
  /^takeout beverages$/i,
  /^(?:all hours|functionalon|out of stock|our hours|operating hours)$/i,
  /^(?:analyticson|analytics on|marketingon|marketing on)$/i,
  /^(?:24hr notice|24\s*hr notice)$/i,
  /^(?:\d+\s*hr notice|1hr notice|3hr notice)$/i,
  /^(?:ages?\s+\d+[–-]\d+\s+for|\d+\s+for)$/i,
  /^(?:first|second|third|fourth|fifth|sixth|seventh|eighth)\s+item\s*(?:-|\/)/i,
  /^we pick(?:\s+(?:premium\s+)?\d+-pack)?$/i,
  /^retail beverage$/i,
  /^(?:appetizer salads?|burger\s*&\s*sandwich accompaniments?|chef recommends?|enhancements?|for the table)$/i,
  /^(?:large plates?|small plates?|pastas?|mains?|choice of|chef'?s suggestions?|accompaniments?|entr[ée]e salads?(?:\s*&\s*sandwiches)?|entr[ée]es?\s+accompaniments?)$/i,
  /^(?:addition|additions?):\s*/i,
  /^(?:barista box|5\s*g thermos)\b/i,
  /^cafe americano$/i,
  /^kindly note that menu items and prices may vary\b/i,
  /^stores?$/i,
  /^\d+\.\s+(?:add|create|make sure)\b/i,
  /^we can be found on both facebook and instagram$/i,
  /^(?:annual events|bid member resources|bid programs & publications|bidness newsletter|business & office directory|calendar|commercial activity|georgetown dc faqs|guides|office space in georgetown|sidewalk extensions & streateries|subscribe to weekly newsletter|visit)$/i,
  /^(milk|egg|eggs|soy|wheat|gluten|sesame|tree nuts?|peanuts?|fish|shellfish|mustard|sulfites?)$/i,
  /\b(menu|nutrition|nutrition & ?allergen|nutrition calculator|special diet and lifestyle menu)$/i,
  /\bmenu\s*-\s*[a-z0-9 &'.-]+$/i,
  /^.+\s+-\s+(?:adams morgan|capitol hill|city center|downtown|dupont|foggy bottom|georgetown|golden triangle|h street|navy yard|penn quarter|shaw|u street|west end)$/i,
  /\bnutrition facts\b/i,
  /\b(freshly made|cooked twice|different kind of dog)\b/i,
  /^(and |ingredients?\b|oil,|flour,|acid pyrophosphate)/i,
  /\.pdf\b/i,
  /\.(?:avif|jpe?g|png|webp|gif|svg)$/i,
  /^[a-z0-9-]+\.(?:com|net|org|co)$/i,
  /(?:^website_app_|_product$|_web-app_|menu category)/i,
];

const catalogArtifactNamePatterns = [
  /^\([A-Z]\)\s*=\s*contains\b/i,
  /^x\s+contains\b.+/i,
  /^=.*\b(?:celiac friendly|dairy free|egg free|gluten friendly)\b/i,
  /^all entr[ée]es will be served\b/i,
  /^all\s+.+\s+are served with\b/i,
  /^all the bites$/i,
  /^american or cheddar cheese$/i,
  /^contains:?\s*$/i,
  /^~\s*[^~]+\s*~$/i,
  /^\(?\s*(?:mg|g|%dv)\s*$/i,
  /^\$?\d+\s+(?:half|whole)\s*\/\s*\$?\d+\s+(?:half|whole)$/i,
  /^\d+\s+(?:bowl|each|serving|oz)\s+(?:\d+\s+){5,}.*/i,
  /^(?:bowl|cup|for\s+\d+|with|without)\s+\d+(?:\.\d+)?\s*(?:bowl|cup|dinner|each|lunch|order|oz|plate|salad|serving)\b/i,
  /(?:\s-\s){4,}/,
  /^(?:by the slice|wiseguy\s*pies?|wiseguypies|oven roasted wings)$/i,
  /^pizza$/i,
  /^tomato sauce,\s*fresh mozzarella,\s*basil$/i,
  /^w\/\s+/i,
  /^book your .+ reservation\b/i,
  /^subscribe to .+ alerts?$/i,
  /^please subscribe to our newsletter$/i,
  /^ben & jerry'?s insider$/i,
  /^(?:book now|payment|your order)$/i,
  /^(?:making a difference|shared success|thoughtful ingredients)$/i,
  /^event reservation$/i,
  /^(?:allow file uploads|essentialon)$/i,
  /^(?:all[- ]night happy hour|father[’']?s day brunch)$/i,
  /^_{2,}\s*/,
  /^make a reservation powered by opentable$/i,
  /^request a quote$/i,
  /^(?:bus & tour accommodations|fresh cuisine & friendly service since|fresh seafood restaurant|healthy options|eat healthy)$/i,
  /^(?:military discount|senior discount|mlietz)$/i,
  /^(?:join our team|private dining room|private room|soccer page)$/i,
  /^(?:host at .+|work at .+|cookie preferences|email signup|newsletter signup)$/i,
  /^(?:girls'? night out|kitchen \+ kocktails catering by kevin kelley|latest news|subscribe to enewsletter)$/i,
  /^(?:important:?|overview|share this:?|submit an order|easy food ideas for group events and potlucks)$/i,
  /^(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}\s*(?:am|pm)$/i,
  /archives$/i,
  /^served from \d{1,2}\s*a\.?m\b/i,
  /^what[’']s for dinner\??$/i,
  /^groups?\s*&?\s*private dining$/i,
  /^.+\bcatering gallery$/i,
  /^(?:custom menus,?\s+seamless service|cateringmexicanfusion eats)$/i,
  /^(?:remove logo|remove ["“]?powered by["”]?|remove powered by branding|remove our branding|share via social media)$/i,
  /^(?:ability to purchase tickets|customize your eventbrite app|design and animation|display events on your website|display multiple events|google map integration|highly customizable|multiple feeds|promote and share your events|sell an unlimited number of tickets through your site|showcase the next event|unlimited events|unlimited news items)$/i,
  /^(?:advanced transitions|autoplay videos|custom arrow style|custom slide speed|full customization)$/i,
  /^(?:custom logo theme|import from fb,?\s*yelp,?\s*google|multiple sources ratings|number of customer reviews|social ratings widget|vr facebook app)$/i,
  /^(?:advertising|back issues|best of nova|contributing writer|dawn klavon|in this issue|internships|magazine|most influential|plaques|realtor client gift subscriptions|submit an event|things to do|top high schools|travel|wellness|writer[’']s guidelines)$/i,
  /^dos\s+(?:xx|equis)$/i,
  /^private parties?(?:\s*&\s*catering|\s+and\s+catering)?$/i,
  /^top it off\b/i,
  /^gluten-friendly yes$/i,
  /^halal food$/i,
  /^ap pizza kit!?$/i,
  /^ice cream catering$/i,
  /^wheat\s*&\s*fruit beers$/i,
  /^today'?s hours$/i,
  /^please note that last call\b/i,
  /^please note:?\s+an automatic\b/i,
  /^served in an award winning\b.*\btortilla$/i,
  /^add toppings$/i,
  /^we serve\b/i,
  /^\d{3,4}\s*cal$/i,
  /^[a-z][a-z ,.'’-]+\.\s*\d{1,3}(?:,\d{3})?\s*cal$/,
  /^zero waste\b/i,
  /\b(?:abv|ibu)\s*\d+(?:\.\d+)?%?/i,
  /\bdog (?:cookies?|treats?)\b/i,
  /\b(?:chippuccino|zilla bonez treat)\b/i,
  /view restaurant$/i,
  /(?:caesar saladmediterranean salad|sodacane sugar soda)/i,
  /^cookbook$/i,
  /^(?:audiobooks?|bookshop\.org|bookstore membership|staff picks)$/i,
  /^&more$/i,
  /^&?pizza loyalty$/i,
  /^check before you eat$/i,
  /^(?:privacy policy|refund policy|terms(?:\s+and\s+conditions)?|cookie policy)$/i,
  /^\d+\.\s+(?:eligibility for refunds|information we collect|refund process|refund approval|non-refundable items|how we use your information|sharing your information|data security|changes to this policy|your rights)\b/i,
  /^pizza allergen information$/i,
  /^nutritional information$/i,
  /^trebletree dev team$/i,
  /^be advised\b/i,
  /^add\s+to-?go\s+bag$/i,
  /^\+{1,2}\s*add\b/i,
  /^\d+\s+people$/i,
  /^pork:\s+our\b/i,
  /^(?:14th street|450 k|alexandria|anacostia|arlington|ashburn|ballston|ballston,?\s*va|bethesda|brookland|capitol hill|chevy chase|city ridge|city ridge,?\s*dc|columbia|dupont circle|fair lakes|falls church|foggy bottom|gaithersburg|georgetown|herndon|hyattsville|landmark|merrifield|mount vernon triangle|nashville,?\s*tn|old town|penn quarter|raleigh,?\s*nc|reston|richmond,?\s*va|rockville|shirlington|springfield,?\s*va|sterling|takoma|tysons|u street|vienna|woodbridge,?\s*va)$/i,
  /^glover park$/i,
  /^(?:alabama|arizona|florida|georgia|illinois|indiana|iowa|maryland|michigan|missouri|north carolina|ohio|virginia|wisconsin)$/i,
  /^(?:all locations|book a space|books|breadcrumbs|careers?|charities|coming soon|corporate benefits|events?|fundraisers?|fundraising|gift cards?|gift certificates?|international|locations?|merch(?:andise)?|news|reservations?|restaurant chains|rewards?|reserve|subscription|photos|reels|social|venue floorplan)$/i,
  /^(?:download pdf menu|download pdf|view details)$/i,
  /^private\s*dining.*join\s+our\s+team.*gift\s+cards?.*franchise\s+opportunity$/i,
  /^napkins?,?\s+utensils?(?:\s+and\s+straws?)?\.?$/i,
  /^disposable cutlery and napkins$/i,
  /^treat someone special to\b/i,
  /^(?:arundel mills|glenarden|foundation|happy hour(?:\s+happy hour)?)$/i,
  /^(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday),?\s+\d{1,2}:\d{2}\s*(?:am|pm)\s+to\s+\d{1,2}:\d{2}\s*(?:am|pm)$/i,
  /^\d{1,2}\s*(?::\d{2})?\s*(?:am|pm)\s+to\s+\d{1,2}\s*(?::\d{2})?\s*(?:am|pm)$/i,
  /^(?:a restaurant|hours|nationalharbor|national harbor|washington\s*d\.?c\.?)$/i,
  /^(?:find us|phone|email|address)$/i,
  /^email address$/i,
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/i,
  /^©\s*\d{4}\b/i,
  /^[a-f0-9]{12,}\s+.+\.(?:avif|webp|jpe?g|png)$/i,
  /^©\s*proudly created with wix\.com$/i,
  /^store hours$/i,
  /^(?:food allergy notice|food menu is halal|fresh and authentic|guest notice|hours of operation)$/i,
  /^(?:accommodate all your dining needs|brief history|let us cater your next event|pick up your favorite food)$/i,
  /^tailored catering for your unique needs$/i,
  /^(?:made for dipping|sweet indulgence|support \+ feed meal)$/i,
  /^(?:parking instructions|vegetable experience)$/i,
  /^book a?table$/i,
  /^(?:dc metro|getting here|hours & info|parking\/metro:|renaissance hotel)$/i,
  /^(?:events and inquiries|our fast casual concept)$/i,
  /^(?:amenities|crowd|dining options|from the business|highlights|offerings|payments|service options)$/i,
  /^(?:doggie bowl|chicken \(dog\)|el tam'?s caf[ée])$/i,
  /^(?:brunch menuserved|dinner menuserved)\b/i,
  /^\(?served until \d{1,2}:\d{2}\s*(?:am|pm) only\)?$/i,
  /^bottomless mimosas$/i,
  /^dear sushi one of\b/i,
  /^love on the run$/i,
  /^slide \d+ content$/i,
  /^pikilia happy hour\b/i,
  /^(?:additional sides|burgers & wraps|chops & kabobs|chutneys|mazza(?:\s*\(.+\))?|qormas(?:\s*\(.+\))?|vegetarian & vegan)$/i,
  /^(?:BREAKFAST STARTERS|ENTRÉES|FARM F ?RESH SALADS|HOMEMADE PASTAS)$/,
  /^SOUP & SALADS$/,
  /^tacos, burritos$/i,
  /^(?:5 star ratings|add customer info|add your social media|advanced sorting options|anonymous commenting|automatic lightbox|customize the look and feel|display comments, reviews & star ratings|easy - no coding required|extreme customization|fully customizable|instant email notifications|menu positioning|moderate your comments|number of comments|optimized display|powerful targeting rules|real-time interaction|remove 'powered by' logo|replies & voting|reply to comments|showcase testimonials|social integration|unlimited submissions|uploading photos|variety of icons|variety of menu styles|wix stores integration)$/i,
  /^(?:advanced video controls|easy parking|events \+ catering|newsletter|pick-?up|sign-?up for our newsletter|restaurant hours|join our newsletter!?|fun starts here|party sections? & packages?|the art of dining|reserve your table)$/i,
  /^“the delicious definition of a neighborhood anchor\.?”$/i,
  /^delicious\s+plant-?based\s+options\s+delivered\b/i,
  /^find out why .+\bfavorite spot\b/i,
  /^reach out to us directly$/i,
  /^loved your visit\??$/i,
  /^[A-Z][a-z]+ [A-Z]:$/i,
  /^(?:five star review by .+|[A-Z][A-Za-z]+ [A-Z]\.?:)$/i,
  /^[A-Z][a-z]+ [A-Z]$/i,
  /^(?:our team|plnt impact)$/i,
  /^extra toppings?\b/i,
  /^(?:catch flights, not feelings|salad toppers)$/i,
  /^diet coke glass$/i,
  /^in the kitchen with\b/i,
  /^(?:ask your server for (?:the )?wines?|bites|drinks:?)$/i,
  /^late night snacks$/i,
  /^!!\s*.+\s*!!$/i,
  /^(?:\d+\s+tickets?\s+left|sold out)!\s+.+\bclass\b/i,
  /^(?:benefits|culture|food & drink|menu & restaurants|reservation & event bookings|travel spain)$/i,
  /^(?:entertainment|parties|party\s*(?:&\s*)?events?\s*menus?|private\s*events?(?:\s*&\s*weddings)?|private\s*bookings?|sports)$/i,
  /^best of \d{4}\b/i,
  /^privateevents\b/i,
  /^(?:make|pick up|shaw)$/i,
  /^(?:change\s+)?pickup time$/i,
  /^(?:carry out|dine in)$/i,
  /^(?:current events|past events|special offerings)$/i,
  /^minimum preparation time\b/i,
  /^what areas do you serve\??$/i,
  /^(?:check account|inquiries|sign up)$/i,
  /^(?:check balance|cookie settings|cookies and ads(?: opens in new window)?|curbside pickup|directions|door(?:dash)? commerce platform|gallery|overnight shipping|purchase|reserve a table|reviews|sale of personal data|strictly necessary cookies|targeting cookies|videos)$/i,
  /cookieyes/i,
  /^(?:accounts\/hashtags per stream|content refresh rate|content updates|custom animation|custom css & javascript|custom font style|custom pins|customize your calendar|disable right-click|image likes|lightbox popup|manual approval|mass csv import|modify the layout|no powr logo|number of @handles & #hashtags|number of animations|number of calendars|number of events|number of images\/videos|number of streams|number of tweets|over 30 languages|posts per account|remove cool text logo|remove inffuse brand ads|responsive design|retweet\/favorite posts|seo alt tags for images|shareable entries|search bar|text search bar|sync with external calendars|connect many social streams|instant vs daily updates|mobile responsive|number of posts|pages and hashtag support|post moderation|remove branding & logo|seo support)$/i,
  /^(?:automatic tax calculations|discount coupons|ecwid mobile app|global shipping & payments|mobile responsive store|no transaction fees|number of products|point-of-sale integrations|sell downloadable goods|sell on facebook|sell on instagram|sell on marketplaces|shopapp application)$/i,
  /^performance cookies$/i,
  /^(?:build your own|caesar|main|main dish|brunch|brunch mains|mocktails?|soft drinks?|soft drinks?\/tea)$/i,
  /^(?:lamb & beef|noodle \/ rice|pictures of food|pork|soup|vegetables)$/i,
  /^(?:aperitivo hour|apertivi|le bollicine|vini bianchi|vini rossi|vino rosato)$/i,
  /^(?:bartaco nutrition and allergy information|chef'?s choice tasting\b.*|choice of appetizer\b.*|food \+ drink|gluten free pasta & vegetarian options available|sans alcohol)$/i,
  /^(?:optional supplement|supper club)$/i,
  /^(?:food pillars|gift|in the news|news & accolades|read more)$/i,
  /^(?:allergen & nutrition information|allergy information|bakery)$/i,
  /^(?:faqs?|media mentions|press|same day orders|submit your art)$/i,
  /^(?:featuring more than|baked & wired\s+\d)/i,
  /^advance orders(?:\s*-\s*.+)?$/i,
  /^(?:common allergies\?|is .+ kosher\?)$/i,
  /^(?:disclaimer|ellipse|hot icon|nutritional calculator)$/i,
  /^\$?\d+\s*(?:donation|off)\b/i,
  /^\d+(?:\.\d+)?\s*oz$/i,
  /^\d+\s+ct$/i,
  /^\d+(?:\.\d+)?\s*oz(?:\s+<?\d+(?:\.\d+)?){6,}$/i,
  /^donation\b/i,
  /\bdonation\b/i,
  /^catering\b/i,
  /\bcoupon\b/i,
  /\bfundraiser\b/i,
  /\bscholars?\b/i,
  /\b(?:pdp|qa|uat)\s*test\b/i,
  /\btest item\b/i,
  /\bdo not use\b/i,
  /\bdummy item\b/i,
  /\boyster riot\b/i,
  /^\(?copy\)?\b/i,
  /^\(real meal\)\b/i,
  /^combo item\b/i,
  /^add tofu or bulgogi$/i,
  /\bEst\.?\s+\d{4}\b/i,
  /\b\d{3,5}\s+[A-Za-z0-9.' -]+(?:avenue|ave|street|st|road|rd|boulevard|blvd|place|pl|drive|dr|lane|ln|northwest|nw|northeast|ne|southeast|se|southwest|sw)\b/i,
  /^(?:limited time )?menu offerings\.?$/i,
  /^(?:ada compliance feedback|allergen statement|allergy charts|all day deals|art|buy|chef'?s specials|dan simons says|discover|download menu|eat for good\.?|find a store|founding spirits(?: dc distillery)?|get help|give a gift(?:in great taste\.?)?|give a giftin great taste\.?|hooked from the first bite|join the team|knead reserve|kids book|large groups & private dining|little digs|market line|more info|our history|pasta club|private dining|restaurant consulting|scratch-cooked and worth it|seasonal specials|select menu below|step|team|the washington post|view menus?)$/i,
  /^join the club$/i,
  /^pizzeria paradiso$/i,
  /^(?:all|allergies & ingredients|cookie policy|make a reservation|online order|pastries & cookies)$/i,
  /^(?:allergen information|amount per serving|calcium|cholesterol|contains gluten|used for general nutrition advice\.?)$/i,
  /^shell\s*fish allergy$/i,
  /^(?:breads|ca\s*tering)$/i,
  /^north italia in\b/i,
  /^-\s+(?:blood orange|grapefruit|orange|peach)\b/i,
  /^(?:add on:|add on:.+|condimenti(?:.+)?|(?:brunch|dinner|lunch) menu \(accessible (?:version|view)\)|served with pizza bianca)$/i,
  /^fff&b\b/i,
  /^farmers restaurant group$/i,
  /\bview restaurant$/i,
  /^(?:available|available .+|facebook page|google reviews|instagram feed|i-82 service fee|tripadvisor page)$/i,
  /^(?:dairy|dairy free|gluten free|vegan option)$/i,
  /^(?:sold out|pint club(?: subscription)?)$/i,
  /^bag fee\b/i,
  /^hand sanitizer\b/i,
  /^mask(?:\s*-\s*.*)?$/i,
  /^(?:add utensils?|utensils?|spoon|fork|knife|napkins?|coffee stirrer|paper straw|giant red straw)$/i,
  /^all specials$/i,
  /^house-made sodas$/i,
  /^(?:common allergens|k-food|western food)$/i,
  /^(?:vegan|vegetarian)$/i,
  /^enjoy your favorites anywhere!?$/i,
  /^review by\b/i,
  /^u-street$/i,
  /^various food and drinks$/i,
  /^add\s+.+\s+\+$/i,
  /^one included\s*\/\s*additional\b/i,
  /^for more info,? call us at:?$/i,
  /^cup\s+\$?\d+(?:\.\d{2})?\s+bowl$/i,
  /^new item$/i,
  /^(?:bottled drinks|breakfast \(until \d{1,2}:\d{2}\s*(?:am|pm)\)|hot drinks|hot food|iced drinks|matcha drinks|pick your pair)$/i,
  /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+[a-z]+\s+\d{1,2}(?:st|nd|rd|th)?$/i,
  /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i,
  /^(?:v|vv|gf|df|gfo|n|d|g|vg|vegan|vegetarian)\s*(?:-|=)\s*[a-z ]+$/i,
  /^\d{1,2}\s*(?::\d{2})?\s*(?:am|pm)?\s*-\s*\d{1,2}\s*(?::\d{2})?\s*(?:am|pm)?(?:\s+[a-z]+){0,4}$/i,
  /^\d+(?:\.\d+)?\s*\([^)]+\)\s*[•-]\s*\d+(?:\.\d+)?/i,
  /^the\s+\d+\s+best\b/i,
  /^this information is applicable\b/i,
  /\bcal\.$/i,
  /^open\s+wed\s*-\s*sun$/i,
  /^[A-Z][A-Za-z '&.-]+\s+Bakery$/i,
  /^(?:makgeolli btl|makku original|p.?o.?g.?g.?i.?o costa prosecco|pulpe .+ muscadet|roots gamay\/cot|terra|triple crossing brewing .+ ipa|via terra garnatxa blanca)$/i,
  /^\d{2,4}\s+(?:ch[aâ]teau\b|patrick bottex\b|.+\b(?:champagne|riesling|pinot|cabernet|merlot|muscadet|prosecco|sancerre|bourgogne|bordeaux)\b)/i,
  /\b(?:muscadet|prosecco)\b/i,
  /^bellini$/i,
  /\b(?:apron|beanie|bucket hat|candle|cookbook|gift card|greeting card|hat|lapel pins?|pins?|shirt|sweatshirt|thank you card|tote|water bottle)\b/i,
  /\b(?:ceramic coffee mug|diner mug)\b/i,
  /\bdog cookies?\b/i,
  /\b(?:canvas bag|cake fee|kitchen a six pack)\b/i,
  /give a gift/i,
  /\b(?:corporate\/group catering|ezcater)\b/i,
  /^(?:arabiyya|bethlehem|boustany|falastin|the palestinian table)\b/i,
  /^[A-Z][A-Za-z '&.-]+\s+DC$/i,
  /^reiddm$/i,
  /^(?:feeding the troops|fries \+ sides|what are you craving\??|who are we\??)$/i,
  /^(?:additional form fields|admins for instant email alerts|advanced animations|advanced data management|advanced hover effects|anti-spam protection|conditional logic|custom autoresponders|custom design|custom form field elements|custom icons|customer confirmation email|customize your form|disable right click|file upload and html content|first 50 subscribers - free|form submissions dashboard|gdrive|google sheets integration|instagram-style filters|limit submissions per user|mailchimp integration|multiple recipients|number of form fields|number of form submissions|number of forms|number of icons|number of photos|number of sign ups|optional and required fields|paypal, stripe and offline payments|pdf submissions|personalize your messages|post-submission options|private and public reports|receive email notifications|receive file attachments|stellar support \\(live chat\\)|utilize mailchimp tags|works with wix contacts|'get more clicks' animations)$/i,
  /^(?:google calendar sync|import from google calendar|remove brand ads|repeating events|venue and organizer|what we offer:?|why choose our private spaces\??|authenticity you can taste)$/i,
  /^(?:email us|highly rated & trusted|open hours|partner with our culinary team|private events at .+|something for every occasion|why choose our catering\??)$/i,
  /^(?:breads? & rice|speciality rice)$/i,
  /^(?:business customers|residential customers)$/i,
  /^(?:connect many social streams|instant vs daily updates|mobile responsive|number of posts|pages and hashtag support|post moderation|remove branding & logo|seo support)$/i,
  /^(?:filehashworkerbundle|wamediawasmworkerbundle|[a-z0-9_-]*workerbundle)$/i,
  /^(?:get unlimited subscribers|stellar support(?:\s*\(live chat\))?)$/i,
  /\bfull-service restaurants$/i,
  /\bcuisine near\b/i,
];

const catalogArtifactCategoryPatterns = [
  /^fees?$/i,
  /^foodware$/i,
  /^business hours telephone$/i,
  /^frequently asked questions$/i,
  /^menu faq[’']?s?$/i,
  /^(?:how we do business|issues we care about|values)$/i,
  /^sign up for blog via email$/i,
  /^(?:cards rewards subscribe|parties and event booking|events catering)$/i,
  /^(?:adult beverages?|after dinner drinks|airplane shot flight|al bicchiere|alla bottiglia|amari & digestivi|bar\s*menu|beer(?:\s*\+\s*bubbly)?|beer\s*\/\s*cider|bottles|canned beers?|cans?\/bottles?|cider|cocktails?|.*cocktails?|cocktail\/beer\/sake|cognac|draft|draft beers?|frizzanti & rose'?|happy hour draft beers|liqueur|local beers?|other booze|other fine cans and bottles|port|post\s*[–—-]\s*dinner sips|raki(?:\s*\(.+\))?|red|reds|reserve bottle list|ros[ée] & orange|rose & skin-contact|sake|shooters?|sparkling|the bottomless experience|vini|whiskey|white|wine(?: & sake)?|wine & sake)$/i,
  /^best of \d{4}\b/i,
  /\b(?:bottled beer|cocktails?|dessert wine|spritz|vino|wine|wines|ros[ée]\s*\/\s*orange)\b/i,
  /^rewards/i,
  /^review by\b/i,
  /^commerce platform$/i,
  /^(?:card balance|card details|client|directions|gallery|our history|reviews|videos)$/i,
  /^(?:privacy policy|refund policy|terms(?:\s+and\s+conditions)?|cookie policy)$/i,
  /^(?:about|ada compliance feedback|allergy charts|atl events catering|careers|email sign up|events|our roots|private parties|reservations?|reserve)$/i,
  /\b(?:employment|jobs near me|text to order location)\b/i,
  /\bevents? calendar\b/i,
  /^data=!/i,
  /^[-\s]+$/i,
  /^\+?\d{10,}$/i,
  /^\d{4,}$/i,
  /^~?\d{6,}$/i,
  /^(?=.*\d)[a-z0-9]{12,}$/i,
  /^(?:opencitydc|i82|restaurant review .+)$/i,
  /^(?:atl colony square|bos seaport|chi fulton market|nsh fifth broadway|weha blue back square|boqueria(?: \d+)?)$/i,
  /^(?:capo dc 2|dc restaurant group the bottom line|devon and blakely washington g street|gcdc|roaming rooster foggy bottom)$/i,
  /^boqueria\s+(?:boston|chicago|nashville|new york|west hartford)\b/i,
  /^(?:amenities|artwork|getting here|large groups private dining|our family farm|private events|secure|team)$/i,
  /^(?:alexandria|dc|founding farmers distillers|founding farmers fishers bakers|king of prussia|moco|reston|tysons)$/i,
  /restaurant review$/i,
  /^national .+ day$/i,
  /^(?:imported|residents hour drinks|soft drinks?\/tea)$/i,
  /\b(?:apparel|hoodie|jacket|jersey|merch(?:andise)?|shirt|soccer shirts?)\b/i,
  /\b(?:in the news|media mentions|press)\b/i,
  /^(?:baked and wired washington|cookie consent|events? list|watch and listen)$/i,
  /\b\d{3,5}\s+[A-Za-z0-9.' -]+(?:avenue|ave|street|st|road|rd|boulevard|blvd|place|pl|drive|dr|lane|ln|northwest|nw|northeast|ne|southeast|se|southwest|sw)\b/i,
  /^may contain:?$/i,
  /^sold out$/i,
  /^non food$/i,
  /\.(?:jpe?g|png|webp|gif|svg)$/i,
];

const itemSourcePriority = {
  "official-api": 6,
  "embedded-flavor-nutrition": 6,
  "pdf-matrix": 6,
  "html-allergen-matrix": 6,
  "pdf-ingredients": 5,
  "square-online-api": 4,
  "next-flight-products": 4,
  "json-structured": 4,
  "popmenu-apollo-state": 4,
  "leye-item-wrap": 4,
  "webflow-cms-menu": 4,
  "menu-list-block": 4,
  "menusifu-api": 4,
  "spotapps-nuxt-menu": 4,
  "heartland-initial-data": 4,
  "wix-restaurant-menus-api": 4,
  "darden-platform-api": 4,
  "supabase-menu-api": 4,
  "menufy-category-api": 4,
  "reviewed-official-image-menu": 4,
  "reviewed-public-order-menu": 4,
  "reviewed-third-party-menu": 4,
  "elementor-menu-heading": 4,
  "laravel-menu-product": 4,
  "html-card": 3,
  "sectioned-image-menu": 3,
  "html-image-menu": 2,
  "pdf-menu": 3,
  "html-link": 2,
  "product-page": 4,
};

const wixRestaurantMenusAppDefinitionId =
  "b278a256-2757-4f19-9313-c05c783bec92";
const wixRestaurantDemoItemNames = [
  "bread & dips",
  "brownie",
  "caesar salad",
  "carrot cake",
  "caprese salad",
  "classic burger",
  "classic cheesecake",
  "cocktails",
  "coffee",
  "crispy calamari",
  "fish of the day",
  "fresh juice",
  "green salad",
  "hand-made ravioli",
  "healthy smoothie",
  "house-made ravioli",
  "lemon meringue pie",
  "chocolate mousse",
  "mushroom risotto",
  "pasta of the day",
  "peanut crusted steak",
  "schnitzel",
  "soft drink",
  "sticky date and ice cream",
  "sticky date & ice cream",
  "tuna sashimi",
  "tofu skewers",
  "veggie burger",
  "wine",
].map((name) => normalizeMenuName(name));
const wixRestaurantDemoItemNameSet = new Set(wixRestaurantDemoItemNames);

const allergenSourcePriority = {
  [allergenSourceTypes.officialAllergenMenu]: 4,
  [allergenSourceTypes.officialIngredients]: 3,
  [allergenSourceTypes.officialProductAllergenSection]: 2,
  [allergenSourceTypes.unavailable]: 0,
};

export async function scrapeRestaurant(source) {
  registerBrandAdapterSource(source);
  const records = [];
  const sourceResults = [];
  const seenUrls = new Set();
  const maxSourceFetches = Number(source.maxSourceFetches ?? 90);
  const sourceProductPageLimit = Number(
    source.productPageLimit ?? productPageLimit,
  );
  const configuredSourceEntries = normalizeConfiguredSourceUrls(source);
  const skippedConfiguredSourceEntries = configuredSourceEntries.filter(
    (entry) => shouldSkipSourceEntryForLocation(source, entry),
  );
  const queue =
    source.id === "starbucks"
      ? []
      : configuredSourceEntries
          .filter((entry) => !shouldSkipSourceEntryForLocation(source, entry))
          .map((entry) => ({
            discovered: false,
            ...entry,
          }));
  const queuedUrls = new Set(
    queue.map((entry) => normalizeUrl(entry.url)).filter(Boolean),
  );

  for (const entry of skippedConfiguredSourceEntries) {
    sourceResults.push(skippedConfiguredSourceManifest(source, entry));
  }
  const enqueueSource = (entry) => {
    const normalizedUrl = normalizeUrl(entry?.url);

    if (
      !normalizedUrl ||
      seenUrls.has(normalizedUrl) ||
      queuedUrls.has(normalizedUrl) ||
      shouldSkipSourceEntryForLocation(source, entry)
    ) {
      return false;
    }

    queuedUrls.add(normalizedUrl);
    queue.push(entry);
    return true;
  };

  while (queue.length > 0) {
    if (sourceResults.length >= maxSourceFetches) {
      sourceResults.push({
        contentKind: "limit",
        finalUrl: null,
        kind: "limit",
        ok: false,
        restaurantId: source.id,
        role: "source-fetch-limit",
        status: "limit",
        url: `source-fetch-limit:${maxSourceFetches}`,
      });
      break;
    }

    const next = queue.shift();

    const normalizedNextUrl = normalizeUrl(next?.url);
    queuedUrls.delete(normalizedNextUrl);

    if (!next || seenUrls.has(normalizedNextUrl)) {
      continue;
    }

    seenUrls.add(normalizedNextUrl);
    const fetched = await fetchSource(
      next.url,
      source,
      next.kind,
      next.fetchOptions,
    );
    sourceResults.push(
      sourceManifestWithQueueMetadata(fetched.manifest, next, fetched.text),
    );

    if (!fetched.ok) {
      for (const fallbackUrl of failedConfiguredMenuFallbackUrls(
        source,
        next,
      )) {
        if (queue.length < 90) {
          enqueueSource({
            configured: false,
            discovered: true,
            kind: sourceTypes.menu,
            role: "domain-fallback-menu",
            url: fallbackUrl,
          });
        }
      }
      continue;
    }

    if (fetched.contentKind === "pdf") {
      records.push(
        ...(await extractPdfItems(
          fetched.text,
          source,
          fetched.finalUrl,
          fetched.buffer,
          next.kind,
        )),
      );
      continue;
    }

    if (fetched.contentKind === "json") {
      for (const link of extractLunchboxNovaMenuApiLinksFromStoreLookup(
        fetched.text,
        source,
        fetched.finalUrl,
        next,
      )) {
        if (queue.length < 90) {
          enqueueSource({
            apiKey: link.apiKey,
            configured: false,
            discovered: true,
            fetchOptions: link.fetchOptions,
            kind: sourceTypes.api,
            referer: link.referer,
            role: link.role,
            storeId: link.storeId,
            url: link.url,
          });
        }
      }

      for (const link of extractWixRestaurantMenuApiLinksFromAccessTokens(
        fetched.text,
        source,
        fetched.finalUrl,
        next,
      )) {
        if (queue.length < 90) {
          enqueueSource({
            configured: false,
            discovered: true,
            fetchOptions: link.fetchOptions,
            kind: sourceTypes.api,
            role: link.role,
            url: link.url,
          });
        }
      }

      records.push(
        ...extractJsonMenuFragmentItems(
          fetched.text,
          source,
          fetched.finalUrl,
          next.kind,
        ),
      );
      records.push(
        ...extractOfficialApiItems(
          fetched.text,
          source,
          fetched.finalUrl,
          next.kind,
        ),
      );
      continue;
    }

    if (fetched.contentKind === "text") {
      records.push(
        ...extractIMenuProScriptItems(
          fetched.text,
          source,
          fetched.finalUrl,
          next.kind,
        ),
      );

      for (const link of extractLunchboxNovaMenuApiLinksFromBundle(
        fetched.text,
        source,
        fetched.finalUrl,
        next,
      )) {
        if (queue.length < 90) {
          enqueueSource({
            configured: false,
            discovered: true,
            fetchOptions: link.fetchOptions,
            kind: sourceTypes.api,
            referer: link.referer,
            role: link.role,
            storeId: link.storeId,
            url: link.url,
          });
        }
      }

      continue;
    }

    if (fetched.contentKind === "xml") {
      records.push(
        ...extractXmlItems(fetched.text, source, fetched.finalUrl, next.kind),
      );

      const detailCandidates = extractProductLinksFromXmlSitemap(
        fetched.text,
        fetched.finalUrl,
      )
        .filter((candidate) => isSameSite(candidate.url, fetched.finalUrl))
        .slice(0, sourceProductPageLimit);

      for (const candidate of detailCandidates) {
        if (seenUrls.has(normalizeUrl(candidate.url))) {
          continue;
        }

        seenUrls.add(normalizeUrl(candidate.url));
        const productPage = await fetchSource(
          candidate.url,
          source,
          sourceTypes.menu,
        );
        sourceResults.push(
          sourceManifestWithQueueMetadata(productPage.manifest, {
            configured: false,
            discovered: true,
            kind: sourceTypes.menu,
            role: "product-detail",
          }),
        );

        if (productPage.ok && productPage.contentKind === "html") {
          const details = extractProductPageItem(
            productPage.text,
            source,
            productPage.finalUrl,
            candidate.name,
          );

          if (details) {
            records.push(details);
          }
        }
      }
      continue;
    }

    if (fetched.contentKind === "xlsx") {
      records.push(
        ...extractSpreadsheetItems(
          fetched.buffer,
          source,
          fetched.finalUrl,
          next.kind,
        ),
      );
      continue;
    }

    if (fetched.contentKind === "html") {
      const htmlResult = extractHtmlItems(
        fetched.text,
        source,
        fetched.finalUrl,
        next.kind,
      );
      records.push(
        ...(fetched.manifest.browserFetched
          ? htmlResult.items.map((item) => ({ ...item, browserFetched: true }))
          : htmlResult.items),
      );

      for (const link of htmlResult.apiLinks) {
        if (queue.length < 90) {
          enqueueSource({
            configured: false,
            discovered: true,
            fetchOptions: link.fetchOptions,
            kind: sourceTypes.api,
            referer: link.referer,
            role: link.role ?? "official-api",
            storeId: link.storeId,
            url: link.url,
          });
        }
      }

      for (const link of htmlResult.discoveredDocuments) {
        const documentKind = classifyDocumentLink(source, link);

        if (documentKind && queue.length < 90) {
          enqueueSource({
            configured: false,
            discovered: true,
            kind: documentKind,
            role:
              documentKind === sourceTypes.allergen
                ? discoveredOfficialDocumentRole(link)
                : "discovered-menu-document",
            url: link.url,
          });
        }
      }

      for (const link of htmlResult.officialPageLinks) {
        if (queue.length < 90) {
          const role = officialPageLinkRole(link);

          if (!role) {
            continue;
          }

          enqueueSource({
            configured: false,
            discovered: true,
            kind: sourceTypes.allergen,
            role,
            url: link.url,
          });
        }
      }

      if (!shouldStopPopmenuMenuDiscovery(fetched.finalUrl, fetched.text)) {
        const relevantMenuPageLinks = htmlResult.menuPageLinks.filter((link) =>
          isDiscoveredPageRelevantToSource(source, link),
        );
        const hasSourceSpecificMenuLandingPage = relevantMenuPageLinks.some(
          (link) =>
            isTopLevelDiscoveredMenuPage(link) &&
            discoveredPageMatchesSourceLocation(source, link),
        );

        for (const link of relevantMenuPageLinks) {
          if (
            hasSourceSpecificMenuLandingPage &&
            isTopLevelDiscoveredMenuPage(link) &&
            !discoveredPageMatchesSourceLocation(source, link)
          ) {
            continue;
          }

          if (queue.length < 90) {
            enqueueSource({
              configured: false,
              discovered: true,
              kind: sourceTypes.menu,
              role: "discovered-menu-page",
              url: link.url,
            });
          }
        }
      }

      const relevantLocationPageLinks = htmlResult.locationPageLinks.filter(
        (link) => isDiscoveredPageRelevantToSource(source, link),
      );
      const hasSourceSpecificLocationPage = relevantLocationPageLinks.some(
        (link) => discoveredPageMatchesSourceLocation(source, link),
      );

      for (const link of relevantLocationPageLinks) {
        if (
          hasSourceSpecificLocationPage &&
          !discoveredPageMatchesSourceLocation(source, link)
        ) {
          continue;
        }

        if (queue.length < 90) {
          enqueueSource({
            configured: false,
            discovered: true,
            kind: sourceTypes.menu,
            role: "discovered-location-page",
            url: link.url,
          });
        }
      }

      const detailCandidates =
        htmlResult.items.length > 0
          ? []
          : htmlResult.productLinks
              .filter((candidate) =>
                isSameSite(candidate.url, fetched.finalUrl),
              )
              .slice(0, sourceProductPageLimit);

      for (const candidate of detailCandidates) {
        if (seenUrls.has(normalizeUrl(candidate.url))) {
          continue;
        }

        seenUrls.add(normalizeUrl(candidate.url));
        const productPage = await fetchSource(
          candidate.url,
          source,
          sourceTypes.menu,
        );
        sourceResults.push(
          sourceManifestWithQueueMetadata(productPage.manifest, {
            configured: false,
            discovered: true,
            kind: sourceTypes.menu,
            role: "product-detail",
          }),
        );

        if (productPage.ok && productPage.contentKind === "html") {
          const details = extractProductPageItem(
            productPage.text,
            source,
            productPage.finalUrl,
            candidate.name,
          );

          if (details) {
            records.push(details);
          }
        }
      }
    }
  }

  const supplemental = await fetchBrandSupplementalRecords(source);
  records.push(...supplemental.records);
  sourceResults.push(...supplemental.sources);

  const officialRecords = officialOnlyRecordsForBrand(source, records);
  const catalogRecords =
    source.id === "chick-fil-a"
      ? officialRecords
      : filterMenuCatalogRecords(officialRecords);
  const productionRecords = preferHighConfidenceMenuRecords(
    catalogRecords,
  ).filter((record) => !isProbablyStrictNonFoodMenuRecord(record, source));
  const adapter = getBrandAdapter(source.id);
  let items = mergeRecords(productionRecords)
    .filter((item, _index, mergedItems) =>
      keepFallbackCategoryArtifactItem(item, mergedItems, source.category),
    )
    .map((item, _index, mergedItems) =>
      restoreOfficialVariantCategory(item, mergedItems),
    )
    .map((item) => sanitizeMenuItemDisplayFields(item))
    .filter(
      (item) =>
        isProbablyMenuItemName(item.name) ||
        source.id === "chick-fil-a" ||
        (source.id === "andpizza-dc" &&
          /^(?:new g|@me don[’']t sub me)$/i.test(item.name ?? "")),
    )
    .filter(
      (item) =>
        source.id === "chick-fil-a" || isProbablyMenuCatalogRecord(item),
    )
    .filter((item) => isAllowedSourceMenuCategory(source, item.category))
    .filter((item) => isAllowedSourceMenuName(source, item.name))
    .filter(
      (item) =>
        source.id === "chick-fil-a" ||
        classifyMenuItemRow(item).kind === "menu-item",
    )
    .slice(0, 2500);
  items = dropWixRestaurantDemoCatalogItems(items, sourceResults);
  items = collapseSparseCategories(items, source.category);
  let officialItemCount = officialItemCountForRestaurant({ items });

  if (
    officialItemCount > 0 &&
    source.allowUnavailableAllergenFallback !== true &&
    !shouldKeepUnavailableItemsForPartialOfficialCoverage(
      items,
      officialItemCount,
    )
  ) {
    const officialApiUrls = authoritativeOfficialApiUrls(items);
    items = items.filter(
      (item) =>
        item.allergenSourceType !== allergenSourceTypes.unavailable ||
        isCurrentUnavailableOfficialApiItem(item, officialApiUrls),
    );
    officialItemCount = officialItemCountForRestaurant({ items });
  }

  const sourceStatus = {
    accommodationOnly:
      source.accommodationOnly === true ||
      Boolean(source.allergyAccommodationPolicy),
    configuredUrlAudit: configuredUrlAuditForSource(source),
    discardedItemCount: Math.max(0, records.length - items.length),
    extractedFoodItemCount: items.length,
    ok: sourceResults.filter((entry) => entry.ok).length,
    failed: sourceResults.filter((entry) => !entry.ok).length,
    nonFoodDocumentSuspected:
      configuredUrlAuditForSource(source).nonFoodDocumentSuspected,
    total: sourceResults.length,
  };
  const officialAllergenStatus = officialStatusForSource({
    source,
    restaurant: { items },
    sourceResults,
  });

  return {
    restaurant: addCoverageMetadata(
      {
        id: source.id,
        brandKey: adapter.brandKey,
        rank: source.rank,
        name: source.name,
        category: source.category,
        address: source.address,
        addressLine1: source.addressLine1,
        addressLine2: source.addressLine2,
        allowUnavailableAllergenFallback:
          source.allowUnavailableAllergenFallback,
        allergyAccommodationPolicy: source.allergyAccommodationPolicy,
        city: source.city,
        country: source.country,
        displayAddress: source.displayAddress,
        domain: source.domain,
        expectedSmallMenu: source.expectedSmallMenu,
        guideUrl:
          configuredSourceEntries.find(
            (entry) => entry.kind === sourceTypes.allergen,
          )?.url ??
          configuredSourceEntries.find(
            (entry) => entry.kind === sourceTypes.menu,
          )?.url,
        guideLabel: configuredSourceEntries.some(
          (entry) => entry.kind === sourceTypes.allergen,
        )
          ? "Official menu and allergen sources"
          : "Official menu source",
        lat: source.lat,
        lng: source.lng,
        locationId: source.locationId,
        postalCode: source.postalCode,
        region: source.region,
        type: source.type,
        updated: runDate.slice(0, 7),
        sourceFamily: adapter.sourceFamily,
        parserProfile: adapter.parserProfile,
        sourceProfile: adapter.sourceProfile,
        sourceStatus,
        officialAllergenStatus,
        officialAllergenRemediationBucket: remediationBucketForStatus(
          officialAllergenStatus,
          {
            restaurant: { items },
            source,
          },
        ),
        allergenDataStatus: {
          officialItemCount,
        },
        sourceUrls: publishableSourceUrls(
          sourceResults.map((entry) => entry.finalUrl ?? entry.url),
        ),
        items,
      },
      adapter,
      runDate,
    ),
    sources: sourceResults,
  };
}

function sourceManifestWithQueueMetadata(
  manifest,
  queueEntry,
  contentText = "",
) {
  return {
    ...manifest,
    configured: queueEntry.configured === true,
    expectedContent: queueEntry.expectedContent ?? manifest.expectedContent,
    officialAllergenContentSignal: officialAllergenContentSignalForSourceResult(
      contentText,
      manifest,
      queueEntry,
    ),
    role: queueEntry.role ?? "unknown",
    trust:
      queueEntry.trust ?? (queueEntry.configured ? "configured" : "discovered"),
    urlWarnings: queueEntry.warnings ?? [],
  };
}

function skippedConfiguredSourceManifest(source, entry) {
  return {
    configured: true,
    contentKind: "skipped",
    expectedContent: entry.expectedContent,
    finalUrl: entry.url,
    kind: entry.kind,
    ok: false,
    restaurantId: source.id,
    role: entry.role ?? "unknown",
    status: "skipped",
    trust: entry.trust ?? "configured",
    url: entry.url,
    urlWarnings: uniqueStrings([
      ...(entry.warnings ?? []),
      "configured-url-foreign-location-skipped",
    ]),
  };
}

function shouldSkipSourceEntryForLocation(source, entry) {
  if (!isLocationScopedMenuEntry(entry)) {
    return false;
  }

  const sourceTokens = sourceLocationTokens(source);

  if (sourceTokens.length === 0) {
    return false;
  }

  const scope = locationScopeFromSourceEntryUrl(entry?.url);

  if (!scope || !locationScopeLooksKnown(scope)) {
    return false;
  }

  return !sourceTokens.some((token) =>
    locationScopeMatchesSourceToken(scope, token),
  );
}

function isLocationScopedMenuEntry(entry) {
  const role = entry?.role ?? "";
  const kind = entry?.kind ?? "";

  if (
    ["official-allergen", "official-nutrition"].includes(role) ||
    kind === sourceTypes.allergen
  ) {
    return false;
  }

  return (
    kind === sourceTypes.menu ||
    kind === sourceTypes.api ||
    /(?:menu|food|order|toast|olo|vendor|api|third-party|special)/i.test(
      `${role} ${entry?.url ?? ""}`,
    )
  );
}

function locationScopeMatchesSourceToken(scope, token) {
  if (!scope || !token) {
    return false;
  }

  const aliases = locationScopeAliases[token] ?? [];

  return (
    scope.includes(token) ||
    token.includes(scope) ||
    aliases.some((alias) => scope.includes(alias))
  );
}

const locationScopeAliases = {
  mclean: ["tysons"],
  tysons: ["mclean"],
};

function locationScopeLooksKnown(scope) {
  return (
    hasKnownStateSuffix(scope) ||
    knownLocationScopeTokens.some((token) => scope.includes(token))
  );
}

function locationScopeFromSourceEntryUrl(url) {
  const menuScope = menuLocationScopeFromUrl(url);

  if (menuScope) {
    if (/\bwashington-(?:st|street)\b/i.test(menuScope)) {
      return "";
    }

    return menuScope;
  }

  let parsed;

  try {
    parsed = new URL(url ?? "");
  } catch {
    return "";
  }

  const segments = parsed.pathname
    .split("/")
    .map((segment) => slugText(segment))
    .filter(Boolean);

  const markerIndexes = segments
    .map((segment, index) => ({ index, segment }))
    .filter(({ segment }) =>
      /^(?:online|order|vendors?|stores?|locations?|location|restaurants?)$/.test(
        segment,
      ),
    );

  for (const { index } of markerIndexes) {
    const next = segments[index + 1] ?? "";

    if (
      next &&
      knownLocationScopeTokens.some((token) => next.includes(token))
    ) {
      return next;
    }
  }

  const scopedSegment = segments.find((segment) => {
    if (/\bwashington-(?:st|street)\b/i.test(segment)) {
      return false;
    }

    return knownLocationScopeTokens.some((token) => segment.includes(token));
  });

  return scopedSegment ?? "";
}

function officialAllergenContentSignalForSourceResult(
  contentText,
  manifest,
  queueEntry,
) {
  const roleText = `${queueEntry?.role ?? ""} ${queueEntry?.kind ?? ""}`;

  if (
    !/\b(?:official[-_ ]?)?(?:allergens?|allergies|allergy|ingredients?|nutrition|dietary|sensitivity|sensitivities)\b/i.test(
      roleText,
    )
  ) {
    return null;
  }

  if (
    /help\.milkbarstore\.com\/.*dietary-restrictions/i.test(
      queueEntry?.url ?? "",
    )
  ) {
    return false;
  }

  if (/cafekindred\.com\/allergy-notice/i.test(queueEntry?.url ?? "")) {
    return false;
  }

  const text =
    manifest?.contentKind === "html"
      ? visibleHtmlTextForOfficialSignal(contentText)
      : cleanText(contentText);

  if (!text) {
    return null;
  }

  const genericAllergenAdviceOnly =
    /\blet'?s talk about food allergies\b/i.test(text) ||
    /\b(?:always read the label|read the label every time|allergen declaration statement)\b/i.test(
      text,
    );
  const hasExplicitItemAllergenCue =
    /\b(?:contains?|may contain)\b/i.test(text) ||
    /\b(?:cross[-\s]?contact|cross[-\s]?contaminat(?:ed|ion)?)\s+with\b.{0,80}\b(?:milk|egg|wheat|gluten|soy|sesame|peanuts?|tree nuts?|fish|shellfish)\b/i.test(
      text,
    );

  if (genericAllergenAdviceOnly && !hasExplicitItemAllergenCue) {
    return false;
  }

  if (
    /\b(?:allergens?|allergies|allergy|common allergens?|contains?|may contain|sensitivities|sensitivity)\b/i.test(
      text,
    )
  ) {
    return true;
  }

  if (
    /\b(?:cross[-\s]?contact|cross[-\s]?contaminat(?:ed|ion)?)\s+with\b.{0,80}\b(?:milk|egg|wheat|gluten|soy|sesame|peanuts?|tree nuts?|fish|shellfish)\b/i.test(
      text,
    )
  ) {
    return true;
  }

  if (
    /\bingredients?\b.{0,180}\b(?:milk|egg|wheat|gluten|soy|sesame|peanuts?|tree nuts?|fish|shellfish)\b/i.test(
      text,
    ) ||
    /\b(?:milk|egg|wheat|gluten|soy|sesame|peanuts?|tree nuts?|fish|shellfish)\b.{0,180}\bingredients?\b/i.test(
      text,
    )
  ) {
    return true;
  }

  return false;
}

function visibleHtmlTextForOfficialSignal(html) {
  if (!html) {
    return "";
  }

  const $ = cheerio.load(html);

  return cleanText(
    $("body")
      .clone()
      .find("script, style, noscript, template, svg")
      .remove()
      .end()
      .text(),
  );
}

export function isAllowedSourceMenuName(source, name) {
  const nameText = cleanMenuName(name);
  const excludedPatterns = source.excludedMenuNamePatterns ?? [];

  if (!nameText) {
    return false;
  }

  const alcoholMenuNamePatterns = [
    /\b(?:abv|pilsner|lager|whitbier|bourbon|whiskey|vodka|martini|tequila|mezcal|rum|gin|pinot|cabernet|chardonnay|ros[ée]|rosso|riesling)\b/i,
    /\b(?:oloroso|amaro|aperol|campari|limoncello|vermouth|spritz|negroni|margarita|sangria|espresso martini)\b/i,
    /^[A-Z0-9 %'’.-]*\b(?:BASIL|CANTALOUPE|GIN|LEMON|SOUK|SPRITZ|TONIC)\b[A-Z0-9 %'’.-]*[•·]?$/i,
  ];

  if (
    alcoholMenuNamePatterns.some((pattern) => pattern.test(nameText)) &&
    !hasSubstantialFoodLanguage(nameText)
  ) {
    return false;
  }

  if (
    source.includeNonAlcoholicBeverages === true &&
    /\b(?:celsius|cola|gatorade|iced tea|lemonade|milk|root beer|soda|water)\b/i.test(
      nameText,
    )
  ) {
    return !excludedPatterns.some((pattern) => pattern.test(nameText));
  }

  const genericExcludedPatterns = [
    /^\$?\s*add\b/i,
    /^\$?\s*sub\b/i,
    /^extra\s+(?:american|avocado|bacon|black beans|blue cheese|cheese|chicken|crab|dressing|honey|lobster|mayo|mayonnaise|ranch|salmon|sauce|shrimp|tartar|tuna|turkey|vegetables?)\b/i,
    /\b(?:operational surcharge|join our team|copyright|all rights reserved)\b/i,
    /^our mission$/i,
    /^(?:0\s*%|n\/a offerings?|after[- ]dinner drinks?|coffee\s*&\s*tea|hot beverages?)$/i,
    /^(?:acqua panna|americano|averna|cappuccino|cortado|espresso|latte|macchiato|san pellegrino)$/i,
    /^(?:american coffee|cappuc?cino(?:\s+[a-z'’.-]+)?|coffee|decaf coffee)$/i,
    /^(?:curry sauce|extra spicy mayo|extra wasabi|extra ginger(?:\s+\(sushi\))?)$/i,
    /^kusshi sushi\b/i,
    /^(?:amrut|anarkali|basil hayden|black label|blue moon|birrificio|cir[òo]|kerner|woodpecker|‘?a rina)\b/i,
    /^[A-Z][a-z]+\.?\s+Intense aromas of\b/i,
    /^(?:best restaurants?|best of loudoun|learn more|press|awards?|media|testimonials?)$/i,
    /^(?:dine with us|join our mailing list!?|suggested sizes for your party:?|we create delici?ous memories)$/i,
    /^[A-Z][A-Za-z]+\s+[A-Z][A-Za-z]+\s+Travel$/i,
    /^(?:followinstagramfacebook|follow instagram facebook|where to find us|avoid the wait and pre[- ]?order)$/i,
    /^(?:menu coming soon|coming soon|opening summer \d{4}|we will see you all very soon)$/i,
    /^.+\s+-\s+(?:alexandria|arlington|ashburn|bethesda|dc|fairfax|falls church|herndon|mclean|reston|tysons|vienna)$/i,
    /\b(?:soda pop|peach tea|less sweet|lemonade|topo chico)\b/i,
    /\b(?:this online store is for takeout only|online store accepts same[- ]?day|limited capacity for takeout)\b/i,
    /^\d{3,5}\s+.+\bWashington\b.*\$\$?\$?\$?\s+·\s+/i,
    /\bfrom the restaurant'?s current official menu or allergen source\b/i,
    /^we serve\b/i,
    /^join us for\b/i,
    /\bbest\s+(?:breakfast|brunch|lunch|dinner)\b.*\bnear\b/i,
    /^(?:breakfast\/brunch|lunch\s*&\s*dinner|business owners)$/i,
    /\bprivate dining room\b/i,
    /^\(?\d{2,4}(?:\s*\/\s*\d{2,4})?\s*cal\)?$/i,
    /^\$\d+(?:\.\d{2})?\s*[•\-–]\s*\d{1,4}\s*cal$/i,
    /^\d{3,5}\s+.+\b(?:street|st\.?|avenue|ave\.?|road|rd\.?|drive|dr\.?|boulevard|blvd\.?|plaza|metro plaza|town square)\b/i,
    /^[A-Z][A-Za-z .'-]+,\s*(?:A[LKZR]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEHINOPST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AIT]|W[AIVY])$/i,
    /^\.+\s*\d*\s*/i,
    /^\/\s*/,
    /^a curated selection of\b/i,
    /^(?:executive pastry chef|sous chef|no show\s*&\s*cancellation policy|served with breakfast potatoes)$/i,
    /\b\d{1,3}[A-Z][a-z]/,
    /^jump to (?:footer|main content|navigation) links$/i,
    /^(?:accessible rooms|capital one center|capital one hall|capital one park)$/i,
    /^(?:a day on the line|chef de cuisine|dining at .+|history and inspiration|q&a with chef .+|sign-up)$/i,
    /^(?:large share|small share|snacks|sweet|apps\/sharables|antipasti|hot beverages|coffee\/tea|boards|salads?\s*\+?\s*soups?|small plates to share|wood[- ]?fired pizzas|customer favorites:?|operating hours|oPERATING HOURS|sans spirits|petite mains|signature cocktails|fusion plates|light\s*&\s*zesty)$/i,
    /^(?:first|second|third|two courses|three courses|adiciones?\s*&\s*maridajes)$/i,
    /^(?:all dishes available a la carte|fines herbes emulsion|olive oil\s*\(v\)|salanova lettuce\b|rhubarb,?\s+cardamom\b)$/i,
    /^kindly note that menu items and prices may vary\b/i,
    /^take out$/i,
    /^takeout beverages$/i,
    /^(?:all hours|functionalon|out of stock|our hours|operating hours)$/i,
    /^(?:analyticson|analytics on|marketingon|marketing on)$/i,
    /^(?:24hr notice|24\s*hr notice)$/i,
    /^(?:\d+\s*hr notice|1hr notice|3hr notice)$/i,
    /^(?:ages?\s+\d+[–-]\d+\s+for|\d+\s+for)$/i,
    /^(?:first|second|third|fourth|fifth|sixth|seventh|eighth)\s+item\s*(?:-|\/)/i,
    /^we pick(?:\s+(?:premium\s+)?\d+-pack)?$/i,
    /^retail beverage$/i,
    /^(?:appetizer salads?|burger\s*&\s*sandwich accompaniments?|chef recommends?|enhancements?|for the table)$/i,
    /^(?:large plates?|small plates?|pastas?|mains?|choice of|chef'?s suggestions?|accompaniments?|entr[ée]e salads?(?:\s*&\s*sandwiches)?|entr[ée]es?\s+accompaniments?)$/i,
    /^(?:addition|additions?):\s*/i,
    /^(?:barista box|5\s*g thermos)\b/i,
    /^cafe americano$/i,
    /^stores?$/i,
    /^\d+\.\s+(?:add|create|make sure)\b/i,
    /^we can be found on both facebook and instagram$/i,
    /^(?:annual events|bid member resources|bid programs & publications|bidness newsletter|business & office directory|calendar|commercial activity|georgetown dc faqs|guides|office space in georgetown|sidewalk extensions & streateries|subscribe to weekly newsletter|newsletter sign up|visit)$/i,
    /^(?:american|age|blended|canadian|highlands|irish|islands|islay|japanese|junmai)$/i,
    /^(?:barcelona reston|brookline|cambridge|cathedral heights|charlotte|dallas|delray beach|denver|fairfield|houston|inman park|minneapolis|nashville|new haven|philadelphia|pittsburgh|raleigh)$/i,
    /^\$?\d+\s+bottles?\s+of\b/i,
    /\b(?:billecart|champagne|brut ros[ée]|veuve clicquot|dassai|denshin|campus oaks|cantina del taburno)\b/i,
    /^(?:disposable bag|extra ginger(?:\s+(?:small|large))?|bottled water)$/i,
    /^(?:bottomless martinis|ballantine'?s|spirits)$/i,
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
    /^(?:taco bamba chef victor albisu|taco bamba founder victor albisu|the surprising success story behind taco bamba creator victor albisu)\b/i,
    /^scandinavian cuisine,\s+\w+\s+\d{1,2},?$/i,
    /^(?:limited|upcoming)$/i,
    /^\d+g\s+Protein\b/i,
    /^hours?(?:tues|mon|wed|thurs|fri|sat|sun)/i,
    /^how many pizzas should you order\??$/i,
    /^(?:we put the finishing touches|you can change or add to an existing order)\b/i,
    /^(?:non-alcoholic|peroni|red|stracci limoncello|union craft brewing|valpolicella|vermentino)\b/i,
    /^(?:a rustic specialty made|boneless chicken,|buttery crisp dosa stuffed|chicken kofta simmered|chickpeas served with|crispy all-purpose flour bread|daal ghost\s+-|festive dining experiences|garlic toast topped|indian cheese, house pickle flavor)/i,
    /^collect visitor emails$/i,
    /^(?:customize thumbnail images|easily add videos|highly responsive support|looping videos)$/i,
    /^asharrprivate$/i,
    /^\d+\s*for\s*\$\d+\b/i,
    /^all-you-can-enjoy\b/i,
    /^(?:with bread|dogon)$/i,
  ];

  return ![...genericExcludedPatterns, ...excludedPatterns].some((pattern) =>
    pattern.test(nameText),
  );
}

function isAllowedSourceMenuCategory(source, category) {
  const categoryText = cleanText(category);
  const excludedPatterns = source.excludedMenuCategoryPatterns ?? [];
  const genericExcludedPatterns = [
    /^(?:0\s*%\s*booze|after\s*[-–—]?\s*dinner drinks?|beverages?|beer|bottles?|coffees?|coffee\s*&\s*tea|coffee\/tea|cooking guide|domestic|drinks?|happy hour|hot beverages?|low\s*&\s*no|n\/a offerings?|non[- ]alcoholic|sans spirits|signature cocktails|sodas?\s*\/\s*water|spirits?|store locator|stores?\s*\d*|teas?|zero proof|mocktails?|wine|wines?)$/i,
  ];

  if (!categoryText) {
    return false;
  }

  if (
    source.includeNonAlcoholicBeverages === true &&
    /^(?:catering\s+)?(?:beverages?|drinks?|coffee|fountain sodas?)$/i.test(
      categoryText,
    )
  ) {
    return !excludedPatterns.some((pattern) => pattern.test(categoryText));
  }

  return ![...genericExcludedPatterns, ...excludedPatterns].some((pattern) =>
    pattern.test(categoryText),
  );
}

function collapseSparseCategories(items, fallbackCategory) {
  if (items.length < 12) {
    return items;
  }

  const counts = new Map();
  for (const item of items) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }

  const singletonCount = [...counts.values()].filter(
    (count) => count === 1,
  ).length;
  const categoryCount = counts.size;

  if (categoryCount < 5 || singletonCount / categoryCount < 0.75) {
    return items;
  }

  return items.map((item) => ({
    ...item,
    category: fallbackCategory ?? "Menu",
  }));
}

function keepFallbackCategoryArtifactItem(item, allItems, fallbackCategory) {
  const fallbackKey = similarityKey(fallbackCategory);

  if (
    !fallbackKey ||
    similarityKey(item?.category) !== fallbackKey ||
    allItems.length < 15
  ) {
    return true;
  }

  const sectionedItemCount = allItems.filter((candidate) => {
    const key = similarityKey(candidate?.category);
    return key && key !== fallbackKey && key !== "menu";
  }).length;

  if (sectionedItemCount < 10) {
    return true;
  }

  const name = cleanText(item?.name);

  if (!name) {
    return false;
  }

  if (
    /\b\d{1,3}(?:[a-z]|[A-Z][a-z])/.test(name) &&
    !/\(\s*\d{1,3}\s*oz\s*\)/i.test(name)
  ) {
    return false;
  }

  if (
    /^(?:from the griddle|house-baked pastries|freshly fruit\s*&\s*berries|buttermilk biscuits\b)/i.test(
      name,
    )
  ) {
    return false;
  }

  return true;
}

function restoreOfficialVariantCategory(item, mergedItems) {
  if (
    item?.allergenSourceType !== allergenSourceTypes.officialAllergenMenu ||
    !item.variantGroup ||
    !item.category ||
    similarityKey(item.category) === similarityKey(item.variantGroup)
  ) {
    return item;
  }

  if (
    isGenericRestaurantCuisineCategory(item.variantGroup) &&
    !isGenericRestaurantCuisineCategory(item.category)
  ) {
    return item;
  }

  const itemNameKeys = new Set(
    mergedItems
      .map((candidate) => similarityKey(candidate.name))
      .filter(Boolean),
  );

  if (!itemNameKeys.has(similarityKey(item.category))) {
    return item;
  }

  return {
    ...item,
    category: item.variantGroup,
  };
}

function shouldKeepUnavailableItemsForPartialOfficialCoverage(
  items,
  officialItemCount,
) {
  if (
    items.length < 10 ||
    officialItemCount >= Math.max(10, Math.ceil(items.length * 0.5))
  ) {
    return false;
  }

  const highQualityStructuredCount = items.filter((item) =>
    ["next-flight-products", "square-online-api", "json-structured"].includes(
      item.sourceType,
    ),
  ).length;

  return (
    highQualityStructuredCount >= Math.max(10, Math.ceil(items.length * 0.6))
  );
}

function sharedOfficialAllergenProfileRecords(source, records) {
  const adapter = getBrandAdapter(source.id);
  const hasSharedAllergenProfile = documentSchemaProfiles.some(
    (profile) =>
      profile.outputType === "official-allergen" &&
      profile.brandKeys?.includes(adapter.brandKey),
  );

  if (!hasSharedAllergenProfile) {
    return [];
  }

  const officialAllergenRecords = records.filter(
    (record) =>
      record.allergenSourceType === allergenSourceTypes.officialAllergenMenu &&
      [
        "embedded-flavor-nutrition",
        "html-allergen-matrix",
        "official-api",
        "pdf-matrix",
      ].includes(record.sourceKind),
  );

  if (officialAllergenRecords.length < 10) {
    return [];
  }

  const allFoodRecordCount = filterMenuCatalogRecords(records).length;
  const minimumCoverage = Math.max(10, Math.ceil(allFoodRecordCount * 0.25));

  return officialAllergenRecords.length >= minimumCoverage ||
    officialAllergenRecords.length >= 40
    ? officialAllergenRecords
    : [];
}

function officialOnlyRecordsForBrand(sourceOrRestaurantId, records) {
  const source =
    typeof sourceOrRestaurantId === "string"
      ? { id: sourceOrRestaurantId }
      : sourceOrRestaurantId;
  const restaurantId = source.id;
  records = records.filter(
    (record) =>
      !(
        record.sourceKind === "html-allergen-narrative" &&
        /^(?:however|like|special)$/i.test(cleanText(record.name) ?? "")
      ),
  );
  const sharedOfficialAllergenRecords = sharedOfficialAllergenProfileRecords(
    source,
    records,
  );

  if (sharedOfficialAllergenRecords.length > 0) {
    if (source.profileMenuIsCanonical === true) {
      const canonicalMenuRecords = records.filter(
        (record) => record.sourceKind === "html-menu",
      );

      if (canonicalMenuRecords.length >= 4) {
        const canonicalNames = new Set(
          canonicalMenuRecords
            .map((record) => similarityKey(record.name))
            .filter(Boolean),
        );
        const matchingProfileRecords = sharedOfficialAllergenRecords.filter(
          (record) => canonicalNames.has(similarityKey(record.name)),
        );
        return [...canonicalMenuRecords, ...matchingProfileRecords];
      }
    }

    return supplementPreferredRecords(
      retainUncoveredOfficialApiMenuRecords(
        sharedOfficialAllergenRecords,
        records,
      ),
      records,
    );
  }

  const dominantOfficialAllergenRecords =
    dominantOfficialAllergenProfileRecords(records);

  if (dominantOfficialAllergenRecords.length > 0) {
    return retainUncoveredOfficialApiMenuRecords(
      dominantOfficialAllergenRecords,
      records,
    );
  }

  if (isThompsonOrderingSource(source)) {
    const htmlCardRecords = records.filter(
      (record) => record.sourceKind === "html-card",
    );

    if (htmlCardRecords.length >= 20) {
      return records.filter(
        (record) =>
          !["pdf-menu", "pdf-menu-grid", "pdf-nutrition-menu"].includes(
            record.sourceKind,
          ),
      );
    }
  }

  if (restaurantId === "dairy-queen") {
    const tableRecords = records.filter(
      (record) => record.sourceKind === "html-allergen-matrix",
    );
    return tableRecords.length > 0
      ? supplementPreferredRecords(tableRecords, records)
      : records;
  }

  if (restaurantId === "pf-changs") {
    const nutritionRecords = recordsWithNutrition(records);
    return nutritionRecords.length > 0
      ? supplementPreferredRecords(nutritionRecords, records)
      : records.filter(
          (record) => record.sourceKind === "html-allergen-matrix",
        );
  }

  if (restaurantId === "nothing-bundt-cakes") {
    const nutritionRecords = recordsWithNutrition(records);
    return nutritionRecords.length > 0
      ? supplementPreferredRecords(nutritionRecords, records)
      : records.filter((record) => record.sourceKind === "html-ingredients");
  }

  if (restaurantId === "chipotle") {
    const apiRecords = records.filter(
      (record) => record.sourceKind === "official-api",
    );
    return apiRecords.length > 0
      ? supplementPreferredRecords(apiRecords, records)
      : records;
  }

  if (restaurantId === "subway") {
    const pdfRecords = records.filter(
      (record) => record.sourceKind === "pdf-matrix",
    );
    return pdfRecords.length > 0
      ? supplementPreferredRecords(pdfRecords, records)
      : records;
  }

  if (restaurantId === "panda-express") {
    const pdfRecords = records.filter(
      (record) => record.sourceKind === "pdf-matrix",
    );
    return pdfRecords.length > 0
      ? supplementPreferredRecords(pdfRecords, records)
      : records;
  }

  if (restaurantId === "zaxbys") {
    const nutritionRecords = recordsWithNutrition(records);

    if (nutritionRecords.length > 0) {
      return supplementPreferredRecords(nutritionRecords, records);
    }

    const pdfRecords = records.filter(
      (record) => record.sourceKind === "pdf-matrix",
    );
    return pdfRecords.length > 0
      ? supplementPreferredRecords(pdfRecords, records)
      : records;
  }

  if (restaurantId === "starbucks") {
    return recordsWithNutrition(records);
  }

  if (restaurantId === "dunkin") {
    const pdfRecords = records.filter(
      (record) => record.sourceKind === "pdf-matrix",
    );
    return pdfRecords.length > 0
      ? recordsWithNutrition(supplementPreferredRecords(pdfRecords, records))
      : records;
  }

  if (restaurantId === "panera") {
    const pdfRecords = records.filter(
      (record) => record.sourceKind === "pdf-matrix",
    );
    return pdfRecords.length > 0
      ? recordsWithNutrition(supplementPreferredRecords(pdfRecords, records))
      : records;
  }

  if (restaurantId === "arbys") {
    const pdfRecords = records.filter(
      (record) => record.sourceKind === "pdf-matrix",
    );
    return pdfRecords.length > 0
      ? supplementPreferredRecords(pdfRecords, records)
      : records;
  }

  if (restaurantId === "dominos") {
    const allergenRecords = records.filter(
      (record) => record.sourceKind === "official-api",
    );
    const supplemented =
      allergenRecords.length > 0
        ? supplementPreferredRecords(allergenRecords, records)
        : records;
    return supplemented.filter(
      (record) =>
        record.nutritionFacts && Object.keys(record.nutritionFacts).length > 0,
    );
  }

  if (restaurantId === "papa-johns") {
    const nutritionRecords = records.filter(
      (record) => record.sourceKind === "html-nutrition",
    );
    return nutritionRecords.length > 0
      ? supplementPreferredRecords(nutritionRecords, records)
      : records;
  }

  if (restaurantId === "shake-shack") {
    const pdfRecords = records.filter(
      (record) => record.sourceKind === "pdf-matrix",
    );
    const supplemented =
      pdfRecords.length > 0
        ? supplementPreferredRecords(pdfRecords, records)
        : records;
    return supplemented.filter(
      (record) =>
        record.nutritionFacts && Object.keys(record.nutritionFacts).length > 0,
    );
  }

  if (restaurantId === "little-caesars") {
    const pdfRecords = records.filter(
      (record) => record.sourceKind === "pdf-matrix",
    );
    return pdfRecords.length > 0
      ? supplementPreferredRecords(pdfRecords, records)
      : records;
  }

  if (restaurantId === "wingstop") {
    const nutritionRecords = records.filter(
      (record) => record.sourceKind === "pdf-nutrition",
    );
    const allergenRecords = records.filter(
      (record) => record.sourceKind === "pdf-matrix",
    );
    const preferredRecords =
      allergenRecords.length > 0 ? allergenRecords : nutritionRecords;
    return preferredRecords.length > 0
      ? supplementPreferredRecords(preferredRecords, records)
      : records;
  }

  if (restaurantId === "sonic") {
    const pdfRecords = records.filter(
      (record) => record.sourceKind === "pdf-matrix",
    );
    return pdfRecords.length > 0
      ? supplementPreferredRecords(pdfRecords, records)
      : records;
  }

  if (restaurantId === "jack-in-the-box") {
    const nutritionRecords = records.filter(
      (record) => record.sourceKind === "pdf-nutrition",
    );
    return nutritionRecords.length > 0
      ? supplementPreferredRecords(nutritionRecords, records)
      : records;
  }

  if (
    [
      "olive-garden",
      "longhorn-steakhouse",
      "outback-steakhouse",
      "dennys",
      "ihop",
    ].includes(restaurantId)
  ) {
    if (
      [
        "olive-garden",
        "longhorn-steakhouse",
        "outback-steakhouse",
        "dennys",
      ].includes(restaurantId)
    ) {
      const nutritionRecords = recordsWithNutrition(records);
      return nutritionRecords.length > 0
        ? supplementPreferredRecords(nutritionRecords, records)
        : records;
    }

    const pdfRecords = records.filter(
      (record) => record.sourceKind === "pdf-matrix",
    );
    return pdfRecords.length > 0
      ? supplementPreferredRecords(pdfRecords, records)
      : records;
  }

  if (restaurantId === "first-watch") {
    const nutritionRecords = recordsWithNutrition(records);

    if (nutritionRecords.length > 0) {
      return supplementPreferredRecords(nutritionRecords, records);
    }

    const pdfRecords = records.filter(
      (record) => record.sourceKind === "pdf-matrix",
    );
    return pdfRecords.length > 0
      ? supplementPreferredRecords(pdfRecords, records)
      : records;
  }

  if (restaurantId === "waffle-house") {
    const pdfRecords = records.filter(
      (record) => record.sourceKind === "pdf-matrix",
    );
    return pdfRecords.length > 0
      ? supplementPreferredRecords(pdfRecords, records)
      : records;
  }

  if (
    [
      "buffalo-wild-wings",
      "red-lobster",
      "yard-house",
      "cheddars",
      "bjs-restaurant",
    ].includes(restaurantId)
  ) {
    const pdfRecords = records.filter(
      (record) => record.sourceKind === "pdf-matrix",
    );
    const nutritionRecords = recordsWithNutrition(records);

    if (restaurantId === "buffalo-wild-wings" && nutritionRecords.length > 0) {
      return supplementPreferredRecords(nutritionRecords, records);
    }

    const supplemented =
      pdfRecords.length > 0
        ? supplementPreferredRecords(pdfRecords, records)
        : records;
    return ["red-lobster", "yard-house", "cheddars", "bjs-restaurant"].includes(
      restaurantId,
    )
      ? recordsWithNutrition(supplemented)
      : supplemented;
  }

  if (restaurantId === "freddys") {
    const officialRecords = records.filter((record) =>
      ["html-allergen-matrix", "html-card"].includes(record.sourceKind),
    );
    return officialRecords.length > 0
      ? recordsWithNutrition(
          supplementPreferredRecords(officialRecords, records),
        )
      : records;
  }

  if (restaurantId === "golden-corral") {
    const nutritionRecords = recordsWithNutrition(records);
    return nutritionRecords.length > 0 ? nutritionRecords : records;
  }

  if (restaurantId === "cracker-barrel") {
    const nutritionRecords = recordsWithNutrition(records);
    return nutritionRecords.length > 0
      ? supplementPreferredRecords(nutritionRecords, records)
      : records;
  }

  if (restaurantId === "tropical-smoothie-cafe") {
    const nutritionRecords = recordsWithNutrition(records);
    return nutritionRecords.length > 0
      ? supplementPreferredRecords(nutritionRecords, records)
      : records;
  }

  if (
    [
      "el-pollo-loco",
      "cava",
      "auntie-annes",
      "zaxbys",
      "first-watch",
      "qdoba",
      "del-taco",
      "nothing-bundt-cakes",
      "churchs-texas-chicken",
      "tim-hortons",
    ].includes(restaurantId)
  ) {
    const nutritionRecords = recordsWithNutrition(records);
    return nutritionRecords.length > 0
      ? supplementPreferredRecords(nutritionRecords, records)
      : records;
  }

  if (restaurantId === "mcdonalds") {
    const apiRecords = records.filter(
      (record) => record.sourceKind === "official-api",
    );
    return apiRecords.length > 0 ? recordsWithNutrition(apiRecords) : records;
  }

  if (restaurantId === "whataburger") {
    const apiRecords = records.filter(
      (record) => record.sourceKind === "official-api",
    );
    return apiRecords.length > 0 ? recordsWithNutrition(apiRecords) : records;
  }

  if (restaurantId === "jersey-mikes") {
    const apiRecords = records.filter(
      (record) => record.sourceKind === "official-api",
    );
    return apiRecords.length > 0 ? recordsWithNutrition(apiRecords) : records;
  }

  if (restaurantId === "in-n-out") {
    const nutritionRecords = recordsWithNutrition(records);
    return nutritionRecords.length > 0
      ? supplementPreferredRecords(nutritionRecords, records)
      : records;
  }

  if (
    [
      "applebees",
      "burger-king",
      "cheesecake-factory",
      "chilis",
      "ihop",
      "popeyes",
      "red-robin",
      "starbucks",
      "texas-roadhouse",
      "whataburger",
    ].includes(restaurantId)
  ) {
    const apiRecords = records.filter(
      (record) => record.sourceKind === "official-api",
    );
    return apiRecords.length > 0
      ? restaurantId === "burger-king"
        ? recordsWithNutrition(apiRecords)
        : apiRecords
      : records;
  }

  return records;
}

export function retainUncoveredOfficialApiMenuRecords(
  preferredRecords,
  allRecords,
) {
  const authoritativeApiUrls = new Set(
    preferredRecords
      .filter((record) => record.sourceKind === "official-api")
      .map((record) => record.sourceUrl)
      .filter(Boolean),
  );

  if (authoritativeApiUrls.size === 0) {
    return preferredRecords;
  }

  const preferredSet = new Set(preferredRecords);
  return allRecords.filter(
    (record) =>
      preferredSet.has(record) ||
      (record.sourceKind === "official-api" &&
        authoritativeApiUrls.has(record.sourceUrl)),
  );
}

export function authoritativeOfficialApiUrls(items) {
  return new Set(
    items
      .filter(
        (item) =>
          item.sourceType === "official-api" &&
          item.allergenSourceType === allergenSourceTypes.officialAllergenMenu,
      )
      .flatMap((item) => item.sourceUrls ?? [])
      .filter(Boolean),
  );
}

export function isCurrentUnavailableOfficialApiItem(item, officialApiUrls) {
  return (
    item.sourceType === "official-api" &&
    item.allergenSourceType === allergenSourceTypes.unavailable &&
    (item.sourceUrls ?? []).some((sourceUrl) => officialApiUrls.has(sourceUrl))
  );
}

function dominantOfficialAllergenProfileRecords(records) {
  const officialAllergenRecords = records.filter(
    (record) =>
      record.allergenSourceType === allergenSourceTypes.officialAllergenMenu &&
      [
        "embedded-flavor-nutrition",
        "html-allergen-matrix",
        "official-api",
        "pdf-matrix",
      ].includes(record.sourceKind),
  );

  if (officialAllergenRecords.length < 40) {
    return [];
  }

  const foodRecordCount = filterMenuCatalogRecords(records).length;

  if (
    foodRecordCount === 0 ||
    officialAllergenRecords.length / foodRecordCount < 0.75
  ) {
    return [];
  }

  return officialAllergenRecords;
}

function isThompsonOrderingSource(source) {
  return [
    ...(source?.menuUrls ?? []),
    ...(source?.allergenUrls ?? []),
    ...(source?.apiUrls ?? []),
    source?.sourceUrl,
    source?.domain,
  ].some((value) =>
    /(?:^|\/\/|\.)(?:order\.)?thompsonrestaurants\.com\b/i.test(
      String(value ?? ""),
    ),
  );
}

function recordsWithNutrition(records) {
  return records.filter(
    (record) =>
      record.nutritionFacts && Object.keys(record.nutritionFacts).length > 0,
  );
}

function supplementPreferredRecords(preferredRecords, allRecords) {
  const supplementalByName = new Map();

  for (const record of allRecords) {
    const key = similarityKey(record.name);

    if (!key || key.length < 2) {
      continue;
    }

    const existing = supplementalByName.get(key) ?? {};
    supplementalByName.set(key, {
      ingredientsText: pickBestDescription(
        existing.ingredientsText,
        record.ingredientsText,
      ),
      nutritionFacts:
        existing.nutritionFacts ??
        normalizeNutritionFacts(record.nutritionFacts),
      sourceUrls: uniqueStrings(
        [...(existing.sourceUrls ?? []), record.sourceUrl].filter(Boolean),
      ),
    });
  }

  return preferredRecords.map((record) => {
    const supplement = supplementalByName.get(similarityKey(record.name));

    if (!supplement) {
      return record;
    }

    return {
      ...record,
      ingredientsText: pickBestDescription(
        record.ingredientsText,
        supplement.ingredientsText,
      ),
      nutritionFacts:
        normalizeNutritionFacts(record.nutritionFacts) ??
        supplement.nutritionFacts,
      sourceUrls: uniqueStrings([
        ...(record.sourceUrls ?? []),
        ...(supplement.sourceUrls ?? []),
      ]),
    };
  });
}

const supplementalSourceProfiles = [
  {
    id: "configured-nutritionix",
    match: (source) => Boolean(source.nutritionix),
    fetch: (source) => fetchConfiguredNutritionixRecords(source),
  },
  {
    id: "mcdonalds-official-nutrition",
    sourceIds: ["mcdonalds"],
    fetch: (source) => fetchMcdonaldsOfficialNutritionRecords(source),
  },
  {
    id: "starbucks-official-nutrition",
    sourceIds: ["starbucks"],
    fetch: (source) => fetchStarbucksOfficialNutritionRecords(source),
  },
  {
    id: "zaxbys-official-plus-nutritionix",
    sourceIds: ["zaxbys"],
    fetch: async (source) => {
      const fallback = fetchZaxbysOfficialFallbackRecords(source);
      const nutrition = await fetchNutritionixSpecialDietsRecords(source, {
        baseUrl: "https://www.nutritionix.com/zaxbys/menu/premium",
        sourceLabel: "Zaxby's Nutritionix online nutrition guide.",
      });

      return {
        records: [...fallback.records, ...nutrition.records],
        sources: [...fallback.sources, ...nutrition.sources],
      };
    },
  },
  {
    id: "wendys-official-nutrition",
    sourceIds: ["wendys"],
    fetch: (source) => fetchWendysOfficialNutritionRecords(source),
  },
  {
    id: "nutritionix-official-json",
    sourceConfigs: [
      {
        id: "culvers",
        menuUrl:
          "https://nix-vue-inm.s3.amazonaws.com/restaurant/culvers/data/menu-latest.json.gz",
        sourceLabel:
          "Official Culver's Nutritionix nutrition and allergen guide.",
      },
      {
        id: "taco-bell",
        menuUrl:
          "https://nix-vue-inm.s3.amazonaws.com/restaurant/taco-bell/data/menu-latest.json.gz",
        sourceLabel:
          "Official Taco Bell Nutritionix nutrition and allergen guide.",
      },
      {
        id: "applebees",
        menuUrl:
          "https://nix-vue-inm.s3.amazonaws.com/restaurant/applebees/data/menu-latest.json.gz",
        sourceLabel:
          "Official Applebee's Nutritionix nutrition and allergen guide.",
      },
      {
        id: "ihop",
        menuUrl:
          "https://nix-vue-inm.s3.amazonaws.com/restaurant/ihop/data/menu-latest.json.gz",
        sourceLabel: "Official IHOP Nutritionix nutrition and allergen guide.",
      },
      {
        id: "pizza-hut",
        menuUrl:
          "https://nix-vue-inm.s3.amazonaws.com/restaurant/pizza-hut/data/menu-latest.json.gz",
        sourceLabel:
          "Official Pizza Hut Nutritionix nutrition and allergen guide.",
      },
      {
        id: "kfc",
        menuUrl:
          "https://nix-vue-inm.s3.amazonaws.com/restaurant/kfc/data/menu-latest.json.gz",
        sourceLabel: "Official KFC Nutritionix nutrition and allergen guide.",
      },
      {
        id: "jimmy-johns",
        menuUrl:
          "https://nix-vue-inm.s3.amazonaws.com/restaurant/jimmy-johns/data/menu-latest.json.gz",
        sourceLabel:
          "Official Jimmy John's Nutritionix nutrition and allergen guide.",
      },
    ],
    fetch: (source, config) => fetchNutritionixOfficialRecords(source, config),
  },
  {
    id: "jersey-mikes-official-nutrition",
    sourceIds: ["jersey-mikes"],
    fetch: (source) => fetchJerseyMikesOfficialNutritionRecords(source),
  },
  {
    id: "churchs-menu-plus-nutritionix",
    sourceIds: ["churchs-texas-chicken"],
    fetch: async (source) => {
      const menu = await fetchChurchsOfficialMenuRecords(source);
      const nutrition = await fetchNutritionixSpecialDietsRecords(source, {
        baseUrl: "https://www.nutritionix.com/churchs-chicken/menu/premium",
        sourceLabel:
          "Church's Texas Chicken Nutritionix online nutrition guide.",
      });

      return {
        records: [...menu.records, ...nutrition.records],
        sources: [...menu.sources, ...nutrition.sources],
      };
    },
  },
  {
    id: "nutritionix-grid",
    sourceConfigs: [
      {
        id: "ruths-chris",
        menuUrl:
          "https://www.nutritionix.com/ruths-chris-steak-house/nutrition-calculator",
        sourceLabel: "Official Ruth's Chris Nutritionix nutrition menu.",
      },
    ],
    fetch: (source, config) => fetchNutritionixGridRecords(source, config),
  },
  {
    id: "rbi-sanity",
    sourceConfigs: [
      {
        id: "burger-king",
        endpoint:
          "https://kjfd81ul.apicdn.sanity.io/v1/graphql/prod_bk_us/default",
        rootField: "allItems",
        sourceLabel: "Official Burger King Sanity menu item allergen data.",
      },
      {
        id: "popeyes",
        endpoint:
          "https://czqk28jt.apicdn.sanity.io/v1/graphql/prod_plk_us/gen3",
        rootField: "allItem",
        sourceLabel: "Official Popeyes Sanity menu item allergen data.",
      },
    ],
    fetch: (source, config) => fetchRbiSanityOfficialRecords(source, config),
  },
  {
    id: "whataburger-official-menu",
    sourceIds: ["whataburger"],
    fetch: (source) => fetchWhataburgerOfficialMenuRecords(source),
  },
  {
    id: "red-robin-official-widget",
    sourceIds: ["red-robin"],
    fetch: (source) => fetchRedRobinOfficialWidgetRecords(source),
  },
  {
    id: "nutritionix-special-diets",
    sourceConfigs: [
      {
        id: "cheesecake-factory",
        baseUrl:
          "https://www.nutritionix.com/the-cheesecake-factory/menu/special-diets/premium",
        sourceLabel:
          "Official The Cheesecake Factory Nutritionix online allergen guide.",
      },
      {
        id: "chilis",
        baseUrl:
          "https://www.nutritionix.com/chilis/menu/special-diets/premium",
        sourceLabel: "Official Chili's Nutritionix online allergen guide.",
      },
      {
        id: "texas-roadhouse",
        baseUrl:
          "https://www.nutritionix.com/texas-roadhouse/menu/special-diets/premium",
        sourceLabel:
          "Official Texas Roadhouse Nutritionix online allergen guide.",
      },
      {
        id: "firehouse-subs",
        baseUrl:
          "https://www.nutritionix.com/firehouse-subs/menu/special-diets/premium",
        sourceLabel:
          "Official Firehouse Subs Nutritionix online allergen guide.",
      },
      {
        id: "marcos-pizza",
        baseUrl:
          "https://www.nutritionix.com/marcos-pizza/menu/special-diets/premium",
        sourceLabel:
          "Official Marco's Pizza Nutritionix online allergen guide.",
      },
      {
        id: "mcalisters-deli",
        baseUrl:
          "https://www.nutritionix.com/mcalisters-deli/menu/special-diets/premium",
        sourceLabel:
          "Official McAlister's Deli Nutritionix online allergen guide.",
      },
      {
        id: "golden-corral",
        baseUrl:
          "https://www.nutritionix.com/golden-corral/nutrition-calculator",
        sourceLabel:
          "Official Golden Corral Nutritionix online allergen guide.",
      },
      {
        id: "bojangles",
        baseUrl: "https://www.nutritionix.com/bojangles/nutrition-calculator",
        sourceLabel: "Bojangles Nutritionix online allergen guide.",
      },
      {
        id: "hardees",
        baseUrl: "https://www.nutritionix.com/hardees/nutrition-calculator",
        sourceLabel: "Hardee's Nutritionix online allergen guide.",
      },
      {
        id: "shake-shack",
        baseUrl: "https://www.nutritionix.com/shake-shack/nutrition-calculator",
        sourceLabel: "Shake Shack Nutritionix online allergen guide.",
      },
      {
        id: "crumbl",
        baseUrl:
          "https://www.nutritionix.com/crumbl-cookies/nutrition-calculator",
        sourceLabel: "Crumbl Nutritionix online allergen guide.",
      },
      {
        id: "first-watch",
        baseUrl: "https://www.nutritionix.com/first-watch/menu/premium",
        sourceLabel: "First Watch Nutritionix online nutrition guide.",
      },
      {
        id: "qdoba",
        baseUrl: "https://www.nutritionix.com/qdoba/menu/premium",
        sourceLabel: "Qdoba Nutritionix online nutrition guide.",
      },
      {
        id: "del-taco",
        baseUrl: "https://www.nutritionix.com/del-taco/menu/premium",
        sourceLabel: "Del Taco Nutritionix online nutrition guide.",
      },
      {
        id: "nothing-bundt-cakes",
        baseUrl: "https://www.nutritionix.com/nothing-bundt-cakes/menu/premium",
        sourceLabel: "Nothing Bundt Cakes Nutritionix online nutrition guide.",
      },
    ],
    fetch: (source, config) =>
      fetchNutritionixSpecialDietsRecords(source, config),
  },
  {
    id: "tim-hortons-nutritionix-with-known-good-fallback",
    sourceIds: ["tim-hortons"],
    fetch: async (source) => {
      const live = await fetchNutritionixSpecialDietsRecords(source, {
        baseUrl: "https://www.nutritionix.com/tim-hortons/menu/premium",
        sourceLabel: "Tim Hortons Nutritionix online nutrition guide.",
      });

      if (recordsWithNutrition(live.records).length > 0) {
        return live;
      }

      const fallback = await fetchKnownGoodNutritionFixtureRecords(source, {
        filename: "tim-hortons-official-nutrition-snapshot.json",
        sourceLabel:
          "Previous known-good Tim Hortons Nutritionix online nutrition guide.",
      });

      return {
        records: fallback.records,
        sources: [...live.sources, ...fallback.sources],
      };
    },
  },
  {
    id: "supabase-menu-categories",
    sourceConfigs: [
      {
        id: "naja-mediterranean-mosaic-fairfax-va",
        apiUrl:
          "https://opbkfijsgaqwmglzfvnt.supabase.co/rest/v1/menu_categories?select=id,name,description,menu_type,menu_items(id,name,description,price)&order=display_order.asc&menu_items.order=display_order.asc",
        anonKey:
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wYmtmaWpzZ2Fxd21nbHpmdm50Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NDk0MDcsImV4cCI6MjA3MzUyNTQwN30.UDsskDX1dVFvTRzzF8Ld5nz6QWRvmVmLMiAZLaf78g0",
        sourceLabel: "NAJA Mediterranean public Supabase menu API.",
      },
    ],
    fetch: (source, config) => fetchSupabaseMenuCategoryRecords(source, config),
  },
  {
    id: "menufy-category-api",
    sourceConfigs: [
      {
        id: "maple-ave-restaurant-vienna-va",
        apiUrl:
          "https://api.menufy.com/v1/locations/16206/categories/all?api_key=U3BlZWR5RGVzZXJ0VG9ydG9pc2U=",
        sourceLabel: "Maple Ave Restaurant Menufy public ordering menu API.",
      },
    ],
    fetch: (source, config) => fetchMenufyCategoryApiRecords(source, config),
  },
  {
    id: "reviewed-official-image-menu-fixtures",
    configs: [
      {
        filename: "q-by-peter-chang-official-image-menu.json",
        sourceId: "q-by-peter-chang-bethesda-md",
        sourceLabel: "Reviewed official Q by Peter Chang image menu.",
      },
      {
        filename: "oak-room-official-pdf-menu.json",
        sourceId: "oak-room-bernadettes-dc",
        sourceLabel: "Reviewed official Oak Room PDF menu.",
      },
      {
        filename: "cafe-riggs-official-pdf-menu.json",
        sourceId: "cafe-riggs-dc",
        sourceLabel: "Reviewed official Cafe Riggs PDF menu.",
      },
      {
        filename: "maydan-official-pdf-menu.json",
        sourceId: "maydan-dc",
        sourceLabel:
          "Reviewed official Maydan PDF menu with official menu allergen symbols.",
      },
      {
        filename: "fountain-inn-official-pdf-menu.json",
        sourceId: "fountain-inn-dc",
        sourceLabel: "Reviewed official Fountain Inn PDF food menu.",
      },
      {
        filename: "little-grand-official-pdf-menu.json",
        sourceId: "little-grand-dc",
        sourceLabel: "Reviewed official Little Grand PDF food menu.",
      },
      {
        filename: "pie-gourmet-reviewed-menu.json",
        sourceId: "pie-gourmet-vienna-va",
        sourceLabel: "Reviewed Pie Gourmet official shop product API.",
      },
      {
        filename: "heirloom-reston-official-image-menu.json",
        sourceId: "heirloom-reston-va",
        sourceLabel: "Reviewed official Heirloom Reston image food menu.",
      },
      {
        filename: "shilling-canning-company-official-image-menu.json",
        sourceId: "shilling-canning-company-dc",
        sourceLabel: "Reviewed official Shilling Canning Company image menu.",
      },
      {
        filename: "harth-tysons-official-hilton-menu.json",
        sourceId: "harth-tysons-va",
        sourceLabel: "Reviewed official Hilton Harth menu page.",
      },
      {
        filename: "cafe-kindred-official-menu.json",
        sourceId: "cafe-kindred-falls-church-va",
        sourceLabel: "Reviewed official Cafe Kindred menu page.",
      },
      {
        filename: "wren-tysons-official-menu.json",
        sourceId: "wren-tysons-va",
        sourceLabel: "Reviewed official Wren Tysons menu page.",
      },
      {
        filename: "tacombi-official-menu.json",
        sourceId: "tacombi-bethesda-md",
        sourceLabel: "Reviewed official Tacombi menu PDF.",
      },
      {
        filename: "sakaki-izakaya-reviewed-menu.json",
        sourceId: "sakaki-izakaya-arlington-va",
        sourceLabel: "Reviewed Sakaki Izakaya ordering menu.",
      },
      {
        filename: "yu-noodles-dc-reviewed-menu.json",
        sourceId: "yu-noodles-dc",
        sourceLabel: "Reviewed Yu Noodles DC public menu evidence.",
      },
      {
        filename: "wagamama-clarendon-reviewed-menu.json",
        sourceId: "wagamama-clarendon-arlington-va",
        sourceLabel: "Reviewed wagamama Clarendon public order menu evidence.",
      },
      {
        filename: "modan-tysons-reviewed-opentable-menu.json",
        sourceId: "modan-tysons-va",
        sourceLabel: "Reviewed Modan OpenTable menu evidence.",
      },
      {
        filename: "idylwood-grill-reviewed-opentable-menu.json",
        sourceId: "idylwood-grill-falls-church-va",
        sourceLabel: "Reviewed Idylwood Grill OpenTable menu evidence.",
      },
      {
        filename: "pho-hai-duong-tysons-official-image-menu.json",
        sourceId: "pho-hai-duong-tysons-va",
        sourceLabel: "Reviewed official Pho Hai Duong image menu.",
      },
      {
        filename: "tasty-kabob-tysons-reviewed-toast-menu.json",
        sourceId: "tasty-kabob-tysons-va",
        sourceLabel: "Reviewed Tasty Kabob Toast ordering menu evidence.",
      },
      {
        filename: "naisho-room-tysons-official-omakase-shell.json",
        sourceId: "naisho-room-tysons-va",
        sourceLabel: "Reviewed official Naisho Room omakase menu shell.",
      },
      {
        filename: "primrose-dc-reviewed-canva-menu.json",
        sourceId: "primrose-dc",
        sourceLabel: "Reviewed Primrose Canva menu evidence.",
      },
      {
        filename: "amparo-fondita-official-pdf-menu.json",
        sourceId: "amparo-fondita-dc",
        sourceLabel: "Reviewed official Amparo Fondita PDF menu.",
      },
      {
        filename: "lavant-garde-official-pdf-menu.json",
        sourceId: "lavant-garde-dc",
        sourceLabel: "Reviewed official L'Avant-Garde PDF menu.",
      },
      {
        filename: "arrels-dc-reviewed-ramw-menu.json",
        sourceId: "arrels-dc",
        sourceLabel: "Reviewed Arrels DC Restaurant Week public menu evidence.",
      },
      {
        filename: "fava-pot-official-pdf-menu.json",
        sourceId: "fava-pot-falls-church-va-dc-metro",
        sourceLabel: "Reviewed official Fava Pot Spring 2026 PDF menu.",
      },
      {
        filename: "kathmandu-dc-reviewed-opening-menu.json",
        sourceId: "kathmandu-tapas-cocktails-dc",
        sourceLabel:
          "Reviewed Kathmandu Tapas & Cocktails public opening menu evidence.",
      },
      {
        filename: "maison-bar-a-vins-official-pdf-menu.json",
        sourceId: "maison-bar-a-vins-dc",
        sourceLabel: "Reviewed official Maison Bar a Vins PDF food menu.",
      },
      {
        filename: "the-green-zone-official-pdf-food-menu.json",
        sourceId: "the-green-zone-dc",
        sourceLabel: "Reviewed official The Green Zone PDF food menu.",
      },
      {
        filename: "providencia-official-image-menu.json",
        sourceId: "providencia-dc",
        sourceLabel: "Reviewed official Providencia image food menu.",
      },
      {
        filename: "tatte-summer-2026-official-allergen-menu.json",
        sourceId: "tatte-reston-va",
        sourceLabel: "Reviewed official Tatte Summer 2026 allergen guide.",
      },
      {
        filename: "tatte-summer-2026-official-allergen-menu.json",
        sourceId: "tatte-bethesda-md",
        sourceLabel: "Reviewed official Tatte Summer 2026 allergen guide.",
      },
      {
        filename: "hinata-sushi-carryout-reviewed-allmenus-menu.json",
        sourceId: "hinata-sushi-carryout-bethesda-md",
        sourceLabel: "Reviewed Hinata Sushi Carry Out public menu evidence.",
      },
      {
        filename: "luzmary-bolivian-official-specialties-menu.json",
        sourceId: "luzmary-bolivian-falls-church-va",
        sourceLabel:
          "Reviewed official Luzmary's Bolivian Restaurant specialties list.",
      },
      {
        filename: "georgetown-seafood-official-pdf-menu.json",
        sourceId: "georgetown-seafood-washington-dc-dc-metro",
        sourceLabel: "Reviewed official Georgetown Seafood PDF menu.",
      },
      {
        filename: "pink-tiger-official-pdf-menu.json",
        sourceId: "pink-tiger-on-the-wharf-washington-dc-dc-metro",
        sourceLabel: "Reviewed official Pink Tiger on the Wharf PDF menu.",
      },
      {
        filename: "trummers-official-pdf-menu.json",
        sourceId: "trummer-s-restaurant-washington-dc-dc-metro",
        sourceLabel: "Reviewed official Trummer's Summer 2026 PDF menu.",
      },
      {
        filename: "honey-pig-bbq-official-image-menu.json",
        sourceId: "honey-pig-bbq-annandale-va-dc-metro",
        sourceLabel: "Reviewed official Honey Pig BBQ image menu.",
      },
      {
        filename: "captain-pells-reviewed-allmenus-menu.json",
        sourceId: "captain-pells-fairfax-crabhouse-fairfax-va-dc-metro",
        sourceLabel: "Reviewed Captain Pell's public Allmenus menu evidence.",
      },
      {
        filename: "sequoia-dc-reviewed-public-menu.json",
        sourceId: "sequoia-dc-washington-dc-dc-metro",
        sourceLabel: "Reviewed Sequoia DC public menu evidence.",
      },
      {
        filename: "six-street-eats-reviewed-menu.json",
        sourceId: "six-street-hospitality-inc-washington-dc-dc-metro",
        sourceLabel: "Reviewed Six Street Eats public menu evidence.",
      },
      {
        filename: "the-auld-shebeen-reviewed-public-menu.json",
        sourceId: "the-auld-shebeen-fairfax-va-dc-metro",
        sourceLabel:
          "Reviewed The Auld Shebeen official and public menu evidence.",
      },
      {
        filename: "ashburn-biryani-grill-reviewed-delivery-menu.json",
        sourceId: "ashburn-biryani-grill-ashburn-va-dc-metro",
        sourceLabel:
          "Reviewed Ashburn Biryani Grill public delivery menu evidence.",
      },
      {
        filename: "bobby-mckeys-reviewed-menu-shell.json",
        sourceId: "bobby-mckey-s-dueling-piano-bar-washington-dc-dc-metro",
        sourceLabel: "Reviewed Bobby McKey's public menu shell evidence.",
      },
      {
        filename: "klobys-smokehouse-reviewed-delivery-menu.json",
        sourceId: "kloby-s-smokehouse-and-whiskey-bar-laurel-md-dc-metro",
        sourceLabel:
          "Reviewed Kloby's Smokehouse public delivery menu evidence.",
      },
      {
        filename: "looneys-pub-college-park-reviewed-pdf-menu.json",
        sourceId: "looney-s-pub-college-park-md-dc-metro",
        sourceLabel: "Reviewed Looney's Pub College Park PDF food menu.",
      },
      {
        filename: "sushi-oishii-ayce-vienna-reviewed-menu.json",
        sourceId: "sushi-oishii-ayce-vienna-va-dc-metro",
        sourceLabel: "Reviewed Sushi Oishii AYCE Vienna public menu evidence.",
      },
      {
        filename: "b-side-mosaic-reviewed-pdf-menu.json",
        sourceId: "b-side-mosaic-fairfax-va",
        sourceLabel: "Reviewed B Side Mosaic PDF food menu.",
      },
      {
        filename: "lao-sze-chuan-north-bethesda-reviewed-delivery-menu.json",
        sourceId: "lao-sze-chuan-north-bethesda-md",
        sourceLabel:
          "Reviewed Lao Sze Chuan North Bethesda public ordering menu evidence.",
      },
      {
        filename: "urban-butcher-reviewed-allmenus-menu.json",
        sourceId: "urban-butcher-silver-spring-md",
        sourceLabel: "Reviewed Urban Butcher public menu evidence.",
      },
    ],
    fetch: (source, config) =>
      fetchReviewedOfficialMenuFixtureRecords(source, config),
  },
];

async function fetchBrandSupplementalRecords(source) {
  const profile = supplementalSourceProfiles.find((candidate) =>
    supplementalSourceProfileMatches(candidate, source),
  );

  return profile
    ? profile.fetch(source, supplementalSourceProfileConfig(profile, source))
    : { records: [], sources: [] };
}

function supplementalSourceProfileMatches(profile, source) {
  if (profile.match?.(source)) {
    return true;
  }

  if (profile.configs?.some((config) => config.sourceId === source.id)) {
    return true;
  }

  if (profile.sourceIds?.includes(source.id)) {
    return true;
  }

  return Boolean(supplementalSourceProfileConfig(profile, source));
}

function supplementalSourceProfileConfig(profile, source) {
  return (
    profile.sourceConfigs?.find((config) => config.id === source.id) ??
    profile.configs?.find((config) => config.sourceId === source.id) ??
    null
  );
}

async function fetchConfiguredNutritionixRecords(source) {
  const configs = Array.isArray(source.nutritionix)
    ? source.nutritionix
    : [source.nutritionix];
  const combined = { records: [], sources: [] };

  for (const config of configs) {
    if (!config?.url) {
      continue;
    }

    const sourceLabel =
      cleanText(config.sourceLabel) ??
      `${source.name} Nutritionix online nutrition guide.`;
    let result = { records: [], sources: [] };

    if (config.type === "official-json") {
      result = await fetchNutritionixOfficialRecords(source, {
        menuUrl: config.url,
        sourceLabel,
      });
    } else if (config.type === "calculator-json") {
      result = await fetchNutritionixCalculatorJsonRecords(source, {
        pageUrl: config.url,
        sourceLabel,
      });
    } else if (config.type === "grid") {
      result = await fetchNutritionixGridRecords(source, {
        menuUrl: config.url,
        sourceLabel,
      });
    } else {
      result = await fetchNutritionixSpecialDietsRecords(source, {
        baseUrl: config.url,
        sourceLabel,
      });
    }

    combined.records.push(...result.records);
    combined.sources.push(...result.sources);
  }

  return combined;
}

async function fetchNutritionixCalculatorJsonRecords(
  source,
  { pageUrl, sourceLabel },
) {
  const page = await fetchSource(pageUrl, source, sourceTypes.api);
  const sources = [page.manifest];

  if (!page.ok || page.contentKind !== "html") {
    return { records: [], sources };
  }

  const initUrl = extractNutritionixCalculatorInitUrl(page.text);

  if (!initUrl) {
    return { records: [], sources };
  }

  const fetched = await fetchSource(initUrl, source, sourceTypes.api);
  sources.push(fetched.manifest);

  if (!fetched.ok || fetched.contentKind !== "json") {
    return { records: [], sources };
  }

  const parsed = parseJsonLoose(fetched.text);
  const calculator = parsed?.calculator;
  const items = calculator?.items;
  const categories = calculator?.categories;
  const defaultIngredients = calculator?.itemDefaultIngredients ?? {};

  if (!items || typeof items !== "object") {
    return { records: [], sources };
  }

  return {
    records: Object.entries(items)
      .map(([id, item]) => {
        const allergenResult = nutritionixCalculatorAllergens(item);
        const ingredientsText = nutritionixCalculatorIngredientsText(
          defaultIngredients[id],
        );
        const evidenceText = nutritionixCalculatorAllergenEvidenceText(
          item?.name,
          allergenResult,
        );

        return createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens: allergenResult.allergens,
          category:
            cleanText(categories?.[item?.category_id]?.name) ?? source.category,
          description: sourceLabel,
          evidenceText: evidenceText ?? sourceLabel,
          imageUrl: null,
          ingredientsText,
          isConfigurable: true,
          mayContain: allergenResult.mayContain,
          name: item?.name,
          nutritionFacts: nutritionFactsFromObject(item),
          sourceKind: "official-api",
          sourceUrl: pageUrl,
          variantGroup: item?.template_id ? String(item.template_id) : null,
        });
      })
      .filter((record) => record.name && isProbablyMenuItemName(record.name)),
    sources,
  };
}

function nutritionixCalculatorAllergenEvidenceText(name, allergenResult) {
  const direct = allergenResult?.allergens ?? [];
  const mayContain = allergenResult?.mayContain ?? [];
  const parts = [];

  if (direct.length > 0) {
    parts.push(`contains ${direct.map(formatAllergenLabel).join(", ")}`);
  }

  if (mayContain.length > 0) {
    parts.push(`may contain ${mayContain.map(formatAllergenLabel).join(", ")}`);
  }

  return parts.length > 0
    ? `Official Nutritionix calculator row: ${cleanText(name) ?? "menu item"} ${parts.join("; ")}.`
    : `Official Nutritionix calculator row: ${cleanText(name) ?? "menu item"} has no supported app allergens marked.`;
}

function formatAllergenLabel(allergen) {
  const labels = {
    egg: "egg",
    fish: "fish",
    gluten: "gluten",
    milk: "milk",
    peanut: "peanut",
    sesame: "sesame",
    shellfish: "shellfish",
    soy: "soy",
    "tree-nut": "tree nut",
    wheat: "wheat",
  };

  return labels[allergen] ?? String(allergen);
}

function extractNutritionixCalculatorInitUrl(html) {
  const match = html.match(/\bcalculatorInitUrl\s*=\s*["']([^"']+)["']/);
  return match?.[1]
    ? match[1]
        .replace(/&amp;/g, "&")
        .replace(/&#x2F;/gi, "/")
        .replace(/&quot;/g, '"')
    : null;
}

function nutritionixCalculatorIngredientsText(defaultIngredients) {
  if (!defaultIngredients || typeof defaultIngredients !== "object") {
    return null;
  }

  return uniqueStrings(
    Object.values(defaultIngredients)
      .map((ingredient) => cleanText(ingredient?.name))
      .filter(Boolean),
  ).join("; ");
}

function nutritionixCalculatorAllergens(item = {}) {
  const fieldMap = new Map([
    ["allergen_contains_Gluten", "gluten"],
    ["allergen_contains_Milk", "milk"],
    ["allergen_contains_Eggs", "egg"],
    ["allergen_contains_Fish", "fish"],
    ["allergen_contains_Shellfish", "shellfish"],
    ["allergen_contains_Crustacean_Shellfish", "shellfish"],
    ["allergen_contains_Molluscan_Shellfish", "shellfish"],
    ["allergen_contains_Tree_Nuts", "tree-nut"],
    ["allergen_contains_Peanuts", "peanut"],
    ["allergen_contains_Wheat", "wheat"],
    ["allergen_contains_Soy", "soy"],
    ["allergen_contains_Sesame", "sesame"],
  ]);
  const direct = [];
  const mayContain = [];

  for (const [field, allergen] of fieldMap) {
    const value = Number(item?.[field]);

    if (value === 1) {
      direct.push(allergen);
    } else if (value === 2) {
      mayContain.push(allergen);
    }
  }

  return {
    allergens: uniqueStrings(direct),
    mayContain: uniqueStrings(mayContain ?? []),
  };
}

async function fetchNutritionixSpecialDietsRecords(
  source,
  { baseUrl, sourceLabel },
) {
  const allergenTags = [
    ["egg", "allergen_contains_eggs"],
    ["fish", "allergen_contains_fish"],
    ["gluten", "allergen_contains_gluten"],
    ["milk", "allergen_contains_milk"],
    ["peanut", "allergen_contains_peanuts"],
    ["sesame", "allergen_contains_sesame"],
    ["shellfish", "allergen_contains_shellfish"],
    ["soy", "allergen_contains_soy"],
    ["tree-nut", "allergen_contains_tree_nuts"],
  ];
  const recordsByName = new Map();
  const sources = [];

  const baseline = await fetchSourceWithRetry(baseUrl, source, sourceTypes.api);
  sources.push(baseline.manifest);

  if (!baseline.ok || baseline.contentKind !== "html") {
    return { records: [], sources };
  }

  const baselineItems = nutritionixBaselineItems(
    baseline.text,
    source,
    baseline.finalUrl,
    sourceLabel,
  );

  if (baselineItems.length === 0) {
    return { records: [], sources };
  }

  for (const item of baselineItems) {
    recordsByName.set(item.name, {
      ...item,
      allergens: [],
    });
  }

  const baselineNames = new Set(recordsByName.keys());
  const baselineComparisonNames = new Set(
    Array.from(baselineNames).map((name) =>
      normalizeNutritionixFilterName(name),
    ),
  );
  const allergenFilterCandidates = [];
  const supportsSpecialDietFilters = !/\/nutrition-calculator\/?$/i.test(
    new URL(baseUrl).pathname,
  );

  for (const [allergen, tag] of supportsSpecialDietFilters
    ? allergenTags
    : []) {
    const containsUrl = nutritionixSpecialDietsUrl(baseUrl, tag, "2");
    const fetched = await fetchSourceWithRetry(
      containsUrl,
      source,
      sourceTypes.api,
    );
    sources.push(fetched.manifest);

    if (!fetched.ok || fetched.contentKind !== "html") {
      continue;
    }

    const filteredItems = extractNutritionixSpecialDietsItems(fetched.text);
    const filteredNames = new Set(filteredItems.map((item) => item.name));
    const normalizedFilteredNames = new Set(
      Array.from(filteredNames).map((name) =>
        normalizeNutritionixFilterName(name),
      ),
    );

    if (
      nutritionixFilterMatchesBaseline(
        normalizedFilteredNames,
        baselineComparisonNames,
      )
    ) {
      continue;
    }

    allergenFilterCandidates.push({
      allergen,
      coverageRatio:
        baselineComparisonNames.size > 0
          ? normalizedSetOverlap(
              normalizedFilteredNames,
              baselineComparisonNames,
            ) / baselineComparisonNames.size
          : 0,
      items: filteredItems,
      normalizedNames: normalizedFilteredNames,
    });
  }

  const validAllergenFilterCandidates = nutritionixFilterCandidatesLookSmeared(
    allergenFilterCandidates,
    baselineComparisonNames,
  )
    ? []
    : allergenFilterCandidates;

  for (const { allergen, items } of validAllergenFilterCandidates) {
    for (const item of items) {
      const existing = recordsByName.get(item.name) ?? {
        ...item,
        allergens: [],
      };
      existing.category = existing.category ?? item.category;
      existing.allergens.push(allergen);
      recordsByName.set(item.name, existing);
    }
  }

  const records = Array.from(recordsByName.values())
    .filter(
      (item) =>
        isProbablyMenuItemName(item.name) &&
        item.nutritionFacts &&
        Object.keys(item.nutritionFacts).length > 0,
    )
    .map((item) =>
      createRecord({
        allergenSourceType:
          validAllergenFilterCandidates.length > 0
            ? allergenSourceTypes.officialAllergenMenu
            : allergenSourceTypes.unavailable,
        allergens: item.allergens,
        category: item.category ?? source.category,
        description: sourceLabel,
        imageUrl: null,
        mayContain: [],
        name: item.name,
        nutritionFacts: item.nutritionFacts,
        sourceKind: "official-api",
        sourceUrl: baseUrl,
        variantGroup: item.category ?? null,
      }),
    );

  return { records, sources };
}

function nutritionixBaselineItems(html, source, url, sourceLabel) {
  const gridItems = extractNutritionixGridItems(html, source, url, sourceLabel);

  if (gridItems.length > 0) {
    return gridItems.map((item) => ({
      category: item.category,
      name: item.name,
      nutritionFacts: item.nutritionFacts,
    }));
  }

  return extractNutritionixSpecialDietsItems(html);
}

function nutritionixFilterMatchesBaseline(filteredNames, baselineNames) {
  if (filteredNames.size !== baselineNames.size) {
    const overlapCount = Array.from(filteredNames).filter((name) =>
      baselineNames.has(name),
    ).length;
    const largerSize = Math.max(filteredNames.size, baselineNames.size);
    const baselineCoverage =
      baselineNames.size > 0 ? overlapCount / baselineNames.size : 0;
    const filteredCoverage =
      filteredNames.size > 0 ? overlapCount / filteredNames.size : 0;

    return (
      (largerSize > 0 && overlapCount / largerSize >= 0.9) ||
      (baselineCoverage >= 0.82 && filteredCoverage >= 0.92)
    );
  }

  for (const name of filteredNames) {
    if (!baselineNames.has(name)) {
      return false;
    }
  }

  return true;
}

function nutritionixFilterCandidatesLookSmeared(candidates, baselineNames) {
  if (candidates.length < 4 || baselineNames.size < 20) {
    return false;
  }

  const broadCandidates = candidates.filter(
    (candidate) => candidate.coverageRatio >= 0.45,
  );

  if (broadCandidates.length < 4) {
    return false;
  }

  if (
    broadCandidates.length >= 7 &&
    median(broadCandidates.map((candidate) => candidate.coverageRatio)) >= 0.55
  ) {
    return true;
  }

  const pairwiseSimilarities = [];
  for (let i = 0; i < broadCandidates.length; i += 1) {
    for (let j = i + 1; j < broadCandidates.length; j += 1) {
      pairwiseSimilarities.push(
        normalizedSetJaccard(
          broadCandidates[i].normalizedNames,
          broadCandidates[j].normalizedNames,
        ),
      );
    }
  }

  return median(pairwiseSimilarities) >= 0.82;
}

function normalizeNutritionixFilterName(name) {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(?:the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedSetOverlap(left, right) {
  let count = 0;

  for (const value of left) {
    if (right.has(value)) {
      count += 1;
    }
  }

  return count;
}

function normalizedSetJaccard(left, right) {
  const overlap = normalizedSetOverlap(left, right);
  const unionSize = new Set([...left, ...right]).size;

  return unionSize > 0 ? overlap / unionSize : 0;
}

function median(values) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

async function fetchSourceWithRetry(url, source, kind, attempts = 3) {
  let lastResult = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await fetchSource(url, source, kind);
    lastResult = result;

    if (
      result.ok ||
      ![429, 500, 502, 503, 504, "error"].includes(result.manifest.status)
    ) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }

  return lastResult;
}

function nutritionixSpecialDietsUrl(baseUrl, allergenTag, allergenFree) {
  const params = new URLSearchParams({
    iFrame: "",
    desktop: "",
    allergenFree,
  });
  params.set("allergenTags[0]", allergenTag);
  return `${baseUrl}?${params.toString()}`;
}

function extractNutritionixSpecialDietsItems(html) {
  const $ = cheerio.load(html);
  const items = [];
  let currentCategory = null;

  $("#inmGrid tbody tr").each((_, row) => {
    const element = $(row);

    if (element.hasClass("subCategory")) {
      currentCategory = cleanText(element.find("h3").first().text());
      return;
    }

    const link = element.find("a.nmItem").first();
    const name = cleanText(
      link.attr("title") ||
        link.text() ||
        element
          .find("td")
          .first()
          .text()
          .replace(/\[more info\]/gi, ""),
    );

    if (
      !name ||
      /^no results found$/i.test(name) ||
      !isProbablyMenuItemName(name)
    ) {
      return;
    }

    items.push({
      category: currentCategory,
      name,
    });
  });

  return items;
}

async function fetchRedRobinOfficialWidgetRecords(source) {
  const apiBaseUrl = "https://widget.api.eagle.bigzpoon.com";
  const widgetUrl = "https://red-robin.widget.eagle.bigzpoon.com/home";
  const deviceId = "allergy-app-red-robin";
  const startedAt = Date.now();
  const sources = [];
  const records = [];

  const widgetHeaders = {
    "device-id": deviceId,
    origin: "https://red-robin.widget.eagle.bigzpoon.com",
    referer: widgetUrl,
    "x-comp-id": "red-robin",
  };

  try {
    const company = await fetchJsonApiSource(
      `${apiBaseUrl}/company`,
      source,
      sourceTypes.api,
      {
        extraHeaders: widgetHeaders,
      },
    );
    sources.push(company.manifest);

    const companyId = company.json?.data?._id;
    const locationId = company.json?.data?.locationInfo?._id;

    if (!company.ok || !companyId || !locationId) {
      return { records, sources };
    }

    const headers = {
      ...widgetHeaders,
      "location-id": locationId,
      "x-comp-id": companyId,
    };
    const preferences = await fetchJsonApiSource(
      `${apiBaseUrl}/preferences`,
      source,
      sourceTypes.api,
      {
        extraHeaders: headers,
      },
    );
    sources.push(preferences.manifest);
    const allergyNameById = new Map(
      (preferences.json?.data?.allergies ?? []).map((allergy) => [
        allergy._id,
        allergy.name,
      ]),
    );

    const categories = await fetchJsonApiSource(
      `${apiBaseUrl}/menucategories?from=red-robin&locationId=${encodeURIComponent(locationId)}`,
      source,
      sourceTypes.api,
      { extraHeaders: headers },
    );
    sources.push(categories.manifest);

    for (const category of categories.json?.data ?? []) {
      const categoryId = category?._id;
      const categoryName = cleanText(category?.name) ?? source.category;

      if (!categoryId) {
        continue;
      }

      const params = new URLSearchParams({
        categoryId,
        from: "red-robin",
        locationId,
      });
      params.set(
        "userPreferences",
        JSON.stringify({
          allergies: [],
          crossContactStatus: false,
          lifestyleChoices: [],
        }),
      );

      const categoryItems = await fetchJsonApiSource(
        `${apiBaseUrl}/menuitems?${params.toString()}`,
        source,
        sourceTypes.api,
        { extraHeaders: headers },
      );
      sources.push(categoryItems.manifest);
      const listItemById = new Map(
        asArray(categoryItems.json?.data?.menuItems).map((item) => [
          item?._id,
          item,
        ]),
      );

      for (const item of categoryItems.json?.data?.menuItems ?? []) {
        const itemId = item?._id;
        const name = cleanText(item?.name);

        if (!itemId || !name || !isProbablyMenuItemName(name)) {
          continue;
        }

        const itemDetail = await fetchJsonApiSource(
          `${apiBaseUrl}/menuitems/${encodeURIComponent(itemId)}`,
          source,
          sourceTypes.api,
          { extraHeaders: headers },
        );
        sources.push(itemDetail.manifest);

        if (!itemDetail.ok || !itemDetail.json?.data) {
          continue;
        }

        records.push(
          createRedRobinWidgetRecord({
            allergyNameById,
            categoryName,
            item: itemDetail.json.data,
            listItem: listItemById.get(itemId),
            sourceUrl: widgetUrl,
          }),
        );
      }
    }
  } catch (error) {
    sources.push({
      contentKind: "error",
      durationMs: Date.now() - startedAt,
      error:
        error instanceof Error
          ? error.message
          : "Unknown Red Robin widget error",
      finalUrl: widgetUrl,
      kind: sourceTypes.api,
      ok: false,
      restaurantId: source.id,
      status: "error",
      url: widgetUrl,
    });
  }

  return { records, sources };
}

function createRedRobinWidgetRecord({
  allergyNameById,
  categoryName,
  item,
  listItem,
  sourceUrl,
}) {
  const allergens = [];
  const mayContain = [];

  for (const restriction of item.allergyRestrictions ?? []) {
    const allergenNames = [
      allergyNameById.get(restriction._id),
      allergyNameById.get(restriction.id),
      restriction.name,
    ].filter(Boolean);
    const mapped = normalizeProviderAllergens(allergenNames);

    if (restriction.status === "Totally Restricted") {
      allergens.push(...mapped);
    } else if (restriction.status === "Possibly Good") {
      mayContain.push(...mapped);
    }
  }

  for (const ingredient of item.ingredients ?? []) {
    mayContain.push(
      ...normalizeProviderAllergens(
        (ingredient.ccAllergyRestrictions ?? [])
          .map((id) => allergyNameById.get(id) ?? id)
          .filter(Boolean),
      ),
    );
  }

  const ingredientTexts = uniqueStrings(
    (item.ingredients ?? [])
      .flatMap((ingredient) => [
        ingredient.ingredientText,
        ...(Array.isArray(ingredient.rawMaterials)
          ? ingredient.rawMaterials
          : []),
      ])
      .filter(Boolean),
  );

  return createRecord({
    allergenSourceType: allergenSourceTypes.officialAllergenMenu,
    allergens,
    category: categoryName,
    description:
      "Official Red Robin interactive allergen and nutrition widget.",
    imageUrl: item.imageUrl ?? null,
    ingredientsText: ingredientTexts.join("; "),
    isConfigurable: (item.choices ?? []).length > 0,
    mayContain,
    name: item.name,
    nutritionFacts: redRobinNutritionFacts(listItem ?? item),
    sourceKind: "official-api",
    sourceUrl,
  });
}

function redRobinNutritionFacts(item) {
  const facts = {};
  const calorieText = cleanText(
    item?.caloriesInfo ?? item?.calorieInfo ?? item?.minmaxCaloriesRange,
  );
  const calories = parseNutritionNumber(calorieText);

  if (calories !== null) {
    facts.Calories = calories;
  } else if (calorieText) {
    facts.Calories = calorieText;
  }

  return normalizeNutritionFacts(facts);
}

function fetchZaxbysOfficialFallbackRecords(source) {
  const sourceUrl = source.allergenUrls[0];
  const sections = [
    {
      category: "Zalads",
      names: [
        "The Grilled House Zalad",
        "The Fried House Zalad",
        "The Garden House Zalad",
        "The Grilled Cobb Zalad",
        "The Fried Cobb Zalad",
        "The Garden Cobb Zalad",
        "The Grilled Asian Zensation Zalad",
        "The Fried Asian Zensation Zalad",
        "The Garden Asian Zensation Zalad",
        "The Grilled Blue Zalad",
        "The Fried Blue Zalad",
        "The Garden Blue Zalad",
      ],
    },
    {
      category: "Sandwiches",
      names: [
        "Kickin' Chicken Sandwich Only",
        "Grilled Chicken Sandwich Only",
        "Nibblerz Only",
        "Signature Sandwich Only with Zax Sauce",
        "Signature Sandwich Only with Spicy Zax Sauce",
        "Add Cheese (1 Slice)",
        "Add Bacon (2 Slices)",
      ],
    },
    {
      category: "Most Popular",
      names: [
        "Chicken Finger Plate (4)",
        "Chicken Finger Plate (5)",
        "Chicken Finger Plate (6)",
        "Buffalo Chicken Finger Plate (4)",
        "Buffalo Chicken Finger Plate (5)",
        "Buffalo Chicken Finger Plate (6)",
        "Boneless Wings & Things",
        "Buffalo Boneless Wings & Things",
        "Traditional Wings & Things",
        "Buffalo Traditional Wings & Things",
        "Boneless Wings Meal (5)",
        "Traditional Wings Meal (5)",
        "Big Zax Snak Meal",
        "Buffalo Big Zax Snak Meal",
      ],
    },
    {
      category: "Boneless Wings",
      names: [
        "Boneless Wings (No Sauce)",
        "Boneless Wings - Wimpy",
        "Boneless Wings - Tongue Torch",
        "Boneless Wings - Nuclear",
        "Boneless Wings - Buffalo Garlic Blaze",
        "Boneless Wings - HHM",
        "Boneless Wings - Sweet & Spicy",
        "Boneless Wings - Teriyaki",
        "Boneless Wings - BBQ",
      ],
    },
    {
      category: "Traditional Wings",
      names: [
        "Traditional Wings (No Sauce)",
        "Traditional Wings - Wimpy",
        "Traditional Wings - Tongue Torch",
        "Traditional Wings - Nuclear",
        "Traditional Wings - Buffalo Garlic Blaze",
        "Traditional Wings - HHM",
        "Traditional Wings - Sweet & Spicy",
        "Traditional Wings - Teriyaki",
        "Traditional Wings - BBQ",
      ],
    },
    {
      category: "Chicken Fingerz",
      names: [
        "Chicken Finger (No Sauce)",
        "Chicken Finger - Wimpy",
        "Chicken Finger - Tongue Torch",
        "Chicken Finger - Nuclear",
        "Chicken Finger - Buffalo Garlic Blaze",
        "Chicken Finger - HHM",
        "Chicken Finger - Sweet & Spicy",
        "Chicken Finger - Teriyaki",
        "Chicken Finger - BBQ",
      ],
    },
    {
      category: "Treats",
      names: [
        "Chocolate Chip Cookie",
        "Fried Cheesecake Bites (No Sauce)",
        "Handcrafted Vanilla Milkshake",
        "Handcrafted Strawberry Milkshake",
        "Handcrafted Chocolate Milkshake",
      ],
    },
    {
      category: "Sauces",
      names: [
        "Honey Mustard",
        "Ranch Sauce",
        "Zax Sauce",
        "Spicy Zax Sauce",
        "Tongue Torch",
        "BBQ",
        "Sweet & Spicy",
      ],
    },
    {
      category: "Dressings",
      names: [
        "Wimpy",
        "Nuclear",
        "Buffalo Garlic Blaze",
        "Hot Honey Mustard",
        "Sweet & Spicy",
        "Teriyaki",
        "Strawberry Sauce",
        "Ranch",
        "Honey Mustard",
        "Zax Sauce",
        "Spicy Zax Sauce",
        "Wimpy",
        "Tongue Torch",
        "Nuclear",
        "Buffalo Garlic Blaze",
        "Hot Honey Mustard",
        "Sweet & Spicy",
        "Teriyaki",
        "BBQ",
        "Blue Cheese",
        "Lite Vinaigrette",
        "Ranch",
        "Citrus Vinaigrette",
      ],
    },
    {
      category: "Sides",
      names: [
        "Chicken Bacon Ranch Loaded Fries",
        "Fried White Cheddar Bites",
        "Crinkle Fries - Regular",
        "Crinkle Fries - Large",
        "Cole Slaw - Side",
        "Texas Toast - Slice",
        "Texas Toast - Basket",
        "Fried Pickles",
        "Asian Slaw - Side",
        "Veggie Eggroll - Eggroll",
      ],
    },
    {
      category: "Boxed Lunch",
      names: [
        "Chicken Fingerz with Zax Sauce",
        "Grilled Cheese Sandwich Only",
        "Kids Crinkle Fries",
        "Goldfish Giant Grahams, Vanilla",
        "Rice Krispie Treat",
      ],
    },
    {
      category: "Drinks",
      names: [
        "Milk 8 oz",
        "Chocolate Milk 8 oz",
        "Apple Juice 6 oz",
        "Sweet Tea Kidz",
        "Sweet Tea Small",
        "Sweet Tea Medium",
        "Sweet Tea Large",
        "Sweet Tea Gallon",
        "Unsweet Tea Kidz",
        "Unsweet Tea Small",
        "Unsweet Tea Medium",
        "Unsweet Tea Large",
        "Unsweet Tea Gallon",
        "Coca-Cola Kidz",
        "Coca-Cola Small",
        "Coca-Cola Medium",
        "Coca-Cola Large",
        "Dr Pepper Kidz",
        "Dr Pepper Small",
        "Dr Pepper Medium",
        "Dr Pepper Large",
        "Sprite Kidz",
        "Sprite Small",
        "Sprite Medium",
        "Sprite Large",
        "Diet Coke Kidz",
        "Diet Coke Small",
        "Diet Coke Medium",
        "Diet Coke Large",
        "Barq's Root Beer Kidz",
        "Barq's Root Beer Small",
        "Barq's Root Beer Medium",
        "Barq's Root Beer Large",
        "Hi-C Flashin' Fruit Punch Kidz",
        "Hi-C Flashin' Fruit Punch Small",
        "Hi-C Flashin' Fruit Punch Medium",
        "Hi-C Flashin' Fruit Punch Large",
        "Hi-C Orange Lavaburst Kidz",
        "Hi-C Orange Lavaburst Small",
        "Hi-C Orange Lavaburst Medium",
        "Hi-C Orange Lavaburst Large",
        "Coca-Cola Zero Sugar Kidz",
        "Coca-Cola Zero Sugar Small",
        "Coca-Cola Zero Sugar Medium",
        "Coca-Cola Zero Sugar Large",
        "Mello Yello Kidz",
        "Mello Yello Small",
        "Mello Yello Medium",
        "Mello Yello Large",
        "Powerade Mountain Berry Blast Kidz",
        "Powerade Mountain Berry Blast Small",
        "Powerade Mountain Berry Blast Medium",
        "Powerade Mountain Berry Blast Large",
        "Fanta Cherry Kidz",
        "Fanta Cherry Small",
        "Fanta Cherry Medium",
        "Fanta Cherry Large",
        "Peach Sweet Tea Small",
        "Peach Sweet Tea Medium",
        "Peach Sweet Tea Large",
        "Peach Unsweetened Tea Small",
        "Peach Unsweetened Tea Medium",
        "Peach Unsweetened Tea Large",
        "Handcrafted Lemonade Kidz",
        "Handcrafted Lemonade Small",
        "Handcrafted Lemonade Medium",
        "Handcrafted Lemonade Large",
        "Handcrafted Strawberry Lemonade Small",
        "Handcrafted Strawberry Lemonade Medium",
        "Handcrafted Strawberry Lemonade Large",
        "Frozen Lemonade Small",
        "Frozen Strawberry Lemonade Small",
      ],
    },
    {
      category: "Catering",
      names: [
        "House - Garden",
        "House - Grilled",
        "House - Fried",
        "House - Half & Half",
        "Cobb - Grilled",
        "Cobb - Fried",
        "Cobb - Half & Half",
        "Asian Zensation Zalad Platter - Garden",
        "Asian Zensation Zalad Platter - Grilled",
        "Asian Zensation Zalad Platter - Fried",
        "Asian Zensation Zalad Platter - Half & Half",
        "Zaxby's Signature Sandwich",
        "2 Nibbler Sandwiches",
        "Grilled Chicken Sandwich",
        "Texas Toast Platter (Half Piece)",
        "Tater Chips Platter (Chips Only)",
        "Cole Slaw - Small",
        "Cole Slaw - Large",
        "1 Nibbler (No Sauce)",
      ],
    },
  ];
  const records = sections.flatMap((section) =>
    section.names.map((name) =>
      createRecord({
        allergenSourceType: allergenSourceTypes.unavailable,
        allergens: [],
        category: section.category,
        description:
          "Official Zaxby's nutrition and allergen guide PDF. Live PDF fetch may be Cloudflare-blocked; this fallback preserves the official guide scope without applying shared-facility warnings as item-level allergens.",
        imageUrl: null,
        mayContain: [],
        name,
        sourceKind: "pdf-matrix",
        sourceUrl,
        variantGroup: name.replace(/\s+(Kidz|Small|Medium|Large|Gallon)$/i, ""),
      }),
    ),
  );

  return {
    records,
    sources: [
      {
        contentKind: "pdf",
        finalUrl: sourceUrl,
        kind: sourceTypes.allergen,
        ok: true,
        restaurantId: source.id,
        status: "fixture",
        url: sourceUrl,
      },
    ],
  };
}

async function fetchMcdonaldsOfficialNutritionRecords(source) {
  const pageUrl = source.allergenUrls[0];
  const page = await fetchSource(pageUrl, source, sourceTypes.allergen);
  const sources = [page.manifest];

  if (!page.ok || page.contentKind !== "html") {
    return { records: [], sources };
  }

  const $ = cheerio.load(page.text);
  const component = $("[data-product-data]").first();
  const productData = parseJsonLoose(component.attr("data-product-data") ?? "");

  if (!Array.isArray(productData?.categoryList)) {
    return { records: [], sources };
  }

  const country = component.attr("data-country") ?? "us";
  const language = component.attr("data-site-language") ?? "en";
  const endpoint = absolutizeUrl(
    component.attr("data-product-collection-api") ?? "/dnaapp/itemList",
    page.finalUrl,
  );
  const records = [];

  for (const category of productData.categoryList) {
    const productIds = Array.isArray(category.productId)
      ? category.productId
      : [];

    if (productIds.length === 0) {
      continue;
    }

    const params = new URLSearchParams({
      country: country.toUpperCase(),
      language,
      showLiveData: component.attr("data-show-live-data") ?? "true",
      nutrient_req: "Y",
      item: productIds.map((id) => `${id}()-`).join(""),
    });
    const fetched = await fetchSource(
      `${endpoint}?${params.toString()}`,
      source,
      sourceTypes.api,
    );
    sources.push(fetched.manifest);

    if (!fetched.ok || fetched.contentKind !== "json") {
      continue;
    }

    const parsed = parseJsonLoose(fetched.text);
    const items = asArray(parsed?.items?.item);

    for (const item of items) {
      const name = cleanText(
        item?.item_name ?? item?.item_marketing_name ?? item?.short_name,
      );

      if (!name || !isProbablyMenuItemName(name)) {
        continue;
      }

      const allergenText = [
        item.item_allergen,
        item.item_additional_allergen,
        ...asArray(item.components?.component).map(
          (componentItem) => componentItem.product_allergen,
        ),
      ]
        .map((value) => (typeof value === "string" ? value : ""))
        .join(" ");
      const ingredientText = [
        item.item_ingredient_statement,
        item.item_additional_text_ingredient_statement,
        ...asArray(item.components?.component).map(
          (componentItem) => componentItem.ingredient_statement,
        ),
      ]
        .map((value) => (typeof value === "string" ? value : ""))
        .join(" ");
      const categoryName =
        cleanText(item.default_category?.category?.name) ??
        cleanText(category.title) ??
        source.category;

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens: uniqueStrings([
            ...findAllergensInText(allergenText),
            ...findDeclaredAllergensOnly(ingredientText),
          ]),
          category: categoryName,
          description:
            item.item_marketing_description ??
            item.item_description ??
            item.description ??
            null,
          imageUrl: mcdonaldsImageUrl(item),
          ingredientsText: ingredientText,
          mayContain: findMayContainAllergens(
            `${allergenText} ${ingredientText}`,
          ),
          name,
          nutritionFacts: nutritionFactsFromObject(item),
          sourceKind: "official-api",
          sourceUrl: fetched.finalUrl,
          variantGroup: item.genesis_menu_item_no ?? item.menu_item_no ?? null,
        }),
      );
    }
  }

  return { records, sources };
}

function mcdonaldsImageUrl(item) {
  // McDonald's DNA nutrition API currently returns stale S3 asset references
  // for these fields. Publishing them creates broken React Native images, so
  // product pages must supply image URLs before McDonald's rows render photos.
  return null;
}

async function fetchJerseyMikesOfficialNutritionRecords(source) {
  const menuUrl = "https://subs.jerseymikes.com/nutrition/data";
  const menu = await fetchSource(menuUrl, source, sourceTypes.api);
  const sources = [menu.manifest];

  if (!menu.ok || menu.contentKind !== "json") {
    return { records: [], sources };
  }

  const categories = parseJsonLoose(menu.text);
  const productRows = [];

  for (const category of asArray(categories)) {
    for (const product of asArray(category.products)) {
      for (const size of asArray(product.sizes)) {
        productRows.push({ category, product, size });
      }
    }
  }

  const records = [];

  for (let index = 0; index < productRows.length; index += 16) {
    const batch = productRows.slice(index, index + 16);
    const batchResults = await Promise.all(
      batch.map(async ({ category, product, size }) => {
        const url = `https://subs.jerseymikes.com/nutrition/${product.id}/${size.id}`;
        const fetched = await fetchSource(url, source, sourceTypes.api);
        return { category, fetched, product, size };
      }),
    );

    for (const { category, fetched, product, size } of batchResults) {
      sources.push(fetched.manifest);

      if (!fetched.ok || fetched.contentKind !== "json") {
        continue;
      }

      const parsed = parseJsonLoose(fetched.text);
      const allergenResult = jerseyMikesAllergens(parsed?.product_ingredients);
      const ingredientsText = jerseyMikesIngredientsText(
        parsed?.product_ingredients,
      );
      const sizeName = cleanText(size.name);
      const name = sizeName ? `${product.name} (${sizeName})` : product.name;

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens: allergenResult.allergens,
          category: cleanText(category.name) ?? source.category,
          description:
            parsed?.description ??
            parsed?.product_description ??
            product.description ??
            null,
          imageUrl: jerseyMikesImageUrl(size.image ?? product.default_image),
          ingredientsText,
          isConfigurable: true,
          mayContain: allergenResult.mayContain,
          name,
          nutritionFacts: nutritionFactsFromJerseyMikesIngredients(
            parsed?.product_ingredients,
          ),
          sourceKind: "official-api",
          sourceUrl: fetched.finalUrl,
          variantGroup: product.id,
        }),
      );
    }
  }

  return { records, sources };
}

function jerseyMikesAllergens(ingredients) {
  const map = new Map([
    ["allergens__egg", "egg"],
    ["allergens__fish", "fish"],
    ["allergens__milk", "milk"],
    ["allergens__peanut", "peanut"],
    ["allergens__shellfish", "shellfish"],
    ["allergens__soy", "soy"],
    ["allergens__tree_nuts", "tree-nut"],
    ["allergens__wheat", "wheat"],
    ["allergens__sesame", "sesame"],
  ]);
  const allergens = [];

  for (const ingredient of asArray(ingredients)) {
    for (const [field, allergen] of map) {
      if (String(ingredient?.[field] ?? "0") === "1") {
        allergens.push(allergen);
      }
    }
  }

  return { allergens: uniqueStrings(allergens), mayContain: [] };
}

function jerseyMikesIngredientsText(ingredients) {
  const names = uniqueStrings(
    asArray(ingredients)
      .map((ingredient) =>
        cleanText(
          ingredient?.name ??
            ingredient?.ingredient_name ??
            ingredient?.display_name ??
            ingredient?.description,
        ),
      )
      .filter(Boolean),
  );

  return names.length > 0 ? names.join(", ") : null;
}

function nutritionFactsFromJerseyMikesIngredients(ingredients) {
  const fieldMap = new Map([
    ["nutrition__total_calories__cal", "Calories"],
    ["nutrition__total_fat__g", "Total Fat"],
    ["nutrition__saturated_fat__g", "Saturated Fat"],
    ["nutrition__trans_fat__g", "Trans Fat"],
    ["nutrition__cholesterol__mg", "Cholesterol"],
    ["nutrition__sodium__mg", "Sodium"],
    ["nutrition__total_carbohydrate__g", "Total Carbohydrates"],
    ["nutrition__dietary_fiber__g", "Dietary Fiber"],
    ["nutrition__sugars__g", "Sugars"],
    ["nutrition__protein__g", "Protein"],
  ]);
  const facts = {};

  for (const ingredient of asArray(ingredients)) {
    for (const [field, label] of fieldMap) {
      const parsed = parseNutritionNumber(String(ingredient?.[field] ?? ""));

      if (parsed !== null) {
        facts[label] = (facts[label] ?? 0) + parsed;
      }
    }
  }

  const roundedFacts = Object.fromEntries(
    Object.entries(facts).map(([label, value]) => [
      label,
      roundNutritionValue(value),
    ]),
  );

  return normalizeNutritionFacts(roundedFacts);
}

function roundNutritionValue(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? Number(value.toFixed(2))
    : value;
}

function jerseyMikesImageUrl(image) {
  return image
    ? `https://subs.jerseymikes.com/media/static/bedrock/lg/${image}.webp`
    : null;
}

async function fetchChurchsOfficialMenuRecords(source) {
  const menuUrl = "https://mobile-api.churchs.com/api/v1/menu";
  const menu = await fetchSource(menuUrl, source, sourceTypes.api);
  const sources = [menu.manifest];

  if (!menu.ok || menu.contentKind !== "json") {
    return { records: [], sources };
  }

  const parsed = parseJsonLoose(menu.text);
  const records = [];

  for (const category of asArray(parsed?.categories)) {
    const categoryName = cleanText(category?.name) ?? source.category;

    for (const item of asArray(category?.items)) {
      const name = cleanText(item?.name);

      if (!name || !isProbablyMenuItemName(name)) {
        continue;
      }

      const detailUrl = item?.id
        ? `https://mobile-api.churchs.com/api/v1/menu/item/${item.id}`
        : null;
      const detail = detailUrl
        ? await fetchSource(detailUrl, source, sourceTypes.api)
        : null;

      if (detail) {
        sources.push(detail.manifest);
      }

      const detailItem =
        detail?.ok && detail.contentKind === "json"
          ? { ...item, ...parseJsonLoose(detail.text) }
          : item;
      const disclosure = getOfficialFoodDisclosure(
        detailItem,
        sourceTypes.menu,
      );

      records.push(
        createRecord({
          allergenSourceType: disclosure.allergenSourceType,
          allergens: disclosure.directAllergens,
          category: categoryName,
          description:
            cleanText(detailItem?.description) ??
            "Official Church's Texas Chicken mobile menu item.",
          imageUrl: absolutizeUrl(
            detailItem?.image ?? detailItem?.thumbnailImage,
            menu.finalUrl,
          ),
          ingredientsText: disclosure.ingredientsText,
          isConfigurable: !detailItem?.supportsQuickAdd,
          mayContain: disclosure.mayContain,
          name,
          nutritionFacts: nutritionFactsFromObject(detailItem),
          sourceKind: "official-api",
          sourceUrl: detail?.ok ? detail.finalUrl : menu.finalUrl,
          variantGroup: cleanText(detailItem?.slug) ?? categoryName,
        }),
      );
    }
  }

  return { records, sources };
}

async function fetchNutritionixGridRecords(source, { menuUrl, sourceLabel }) {
  const fetched = await fetchSource(menuUrl, source, sourceTypes.api);
  const sources = [fetched.manifest];

  if (!fetched.ok || fetched.contentKind !== "html") {
    return { records: [], sources };
  }

  return {
    records: extractNutritionixGridItems(
      fetched.text,
      source,
      fetched.finalUrl,
      sourceLabel,
    ),
    sources,
  };
}

function extractNutritionixGridItems(html, source, url, sourceLabel) {
  const $ = cheerio.load(html);
  const headers = $("#inmGrid thead th")
    .toArray()
    .map((header) =>
      cleanText(
        $(header).find(".tblHeader span").first().text() || $(header).text(),
      )?.replace(/\s*Sort by\s+.*$/i, ""),
    )
    .map(
      (header, index) => header ?? (index === 0 ? "Item" : `Value ${index}`),
    );
  const records = [];
  let currentCategory = source.category;

  $("#inmGrid tbody tr").each((_index, row) => {
    const element = $(row);

    if (element.hasClass("subCategory")) {
      currentCategory =
        cleanText(element.find("h3").first().text()) ?? source.category;
      return;
    }

    const link = element.find("a.nmItem").first();
    const name = cleanText(
      link.attr("title") ||
        link.text() ||
        element
          .find("td")
          .first()
          .text()
          .replace(/\[more info\]/gi, ""),
    );

    if (
      !name ||
      /^no results found$/i.test(name) ||
      !isProbablyMenuItemName(name)
    ) {
      return;
    }

    const nutritionFacts = {};

    const cells =
      element.find("td.col").length > 0
        ? element.find("td.col")
        : element.find("td").slice(1);

    cells.each((cellIndex, cell) => {
      const header =
        normalizeNutritionHeader(headers[cellIndex + 1]) ??
        headers[cellIndex + 1] ??
        `Value ${cellIndex + 1}`;
      const value =
        cleanText($(cell).attr("title")) ?? cleanText($(cell).text());

      if (value) {
        nutritionFacts[header] = value;
      }
    });

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.unavailable,
        allergens: [],
        category: currentCategory,
        description: sourceLabel,
        imageUrl: null,
        mayContain: [],
        name,
        nutritionFacts,
        sourceKind: "official-api",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  });

  return records.filter(isProbablyNutritionixGridFoodOrFoodAdjacentRecord);
}

function isProbablyNutritionixGridFoodOrFoodAdjacentRecord(record) {
  const name = cleanText(record?.name) ?? "";
  const category = cleanText(record?.category) ?? "";
  const text = `${name} ${category}`;
  const categorySuggestsDrinksOnly =
    /\b(?:beverage|cocktails?|drink|swizzle|wine|beer|spirits?)\b/i.test(
      category,
    );
  const nameSuggestsAlcoholOnly =
    /\b(?:bloody mary|cosmo|cosmopolitan|gin|manhattan|margarita|martini|mezcal|mojito|negroni|rum|sangria|spritz|tequila|vodka|whisk(?:e)?y|wine)\b/i.test(
      name,
    );

  if (!categorySuggestsDrinksOnly && !nameSuggestsAlcoholOnly) {
    return true;
  }

  return hasFoodLanguage(text);
}

async function fetchNutritionixOfficialRecords(
  source,
  { menuUrl, sourceLabel },
) {
  const fetched = await fetchSource(menuUrl, source, sourceTypes.api);
  const sources = [fetched.manifest];

  if (!fetched.ok || fetched.contentKind !== "json") {
    return { records: [], sources };
  }

  const parsed = parseJsonLoose(fetched.text);
  const items = Object.values(parsed?.items ?? {});
  const categoryById = new Map(
    (parsed?.categories ?? []).map((category) => [
      category.id,
      cleanText(category.name),
    ]),
  );

  return {
    records: items
      .filter((item) => item?.isActive !== 0 && item?.name)
      .map((item) => {
        const allergenResult = nutritionixAllergens(item.allergens);
        const officialAllergenCoveredIds = nutritionixItemAllergenCoverage(
          parsed?.availableAllergenFields,
          item.allergens,
        );
        const ingredientsText = stringifySelectedFields(item, [
          "ingredients",
          "ingredientStatement",
          "ingredientStatements",
        ]);

        return createRecord({
          allergenSourceType:
            officialAllergenCoveredIds.length > 0
              ? allergenSourceTypes.officialAllergenMenu
              : allergenSourceTypes.unavailable,
          allergens: allergenResult.allergens,
          officialAllergenCoveredIds,
          category: categoryById.get(item.categoryId) ?? source.category,
          description: sourceLabel,
          imageUrl:
            item.imageUrl ?? item.largeImageUrl ?? item.smallImageUrl ?? null,
          ingredientsText,
          isConfigurable:
            Array.isArray(item.modifiers) && item.modifiers.length > 0,
          mayContain: allergenResult.mayContain,
          name: item.name,
          nutritionFacts: nutritionFactsFromObject(item),
          sourceKind: "official-api",
          sourceUrl: fetched.finalUrl,
          variantGroup: item.templateId ? String(item.templateId) : null,
        });
      })
      .filter((record) => record.name && isProbablyMenuItemName(record.name)),
    sources,
  };
}

export function nutritionixAvailableAllergenCoverage(availableFields = {}) {
  const fieldMap = new Map([
    ["gluten", "gluten"],
    ["milk", "milk"],
    ["eggs", "egg"],
    ["fish", "fish"],
    ["shellfish", "shellfish"],
    ["crustaceanShellfish", "shellfish"],
    ["molluscanShellfish", "shellfish"],
    ["treeNuts", "tree-nut"],
    ["peanuts", "peanut"],
    ["wheat", "wheat"],
    ["soy", "soy"],
    ["sesame", "sesame"],
  ]);

  return uniqueStrings(
    [...fieldMap]
      .filter(([field]) => availableFields?.[field] === 1 || availableFields?.[field] === true)
      .map(([, allergen]) => allergen),
  ).sort();
}

export function nutritionixItemAllergenCoverage(
  availableFields = {},
  itemAllergens = {},
) {
  const availableIds = new Set(
    nutritionixAvailableAllergenCoverage(availableFields),
  );
  const fieldMap = new Map([
    ["gluten", "gluten"],
    ["milk", "milk"],
    ["eggs", "egg"],
    ["fish", "fish"],
    ["shellfish", "shellfish"],
    ["crustaceanShellfish", "shellfish"],
    ["molluscanShellfish", "shellfish"],
    ["treeNuts", "tree-nut"],
    ["peanuts", "peanut"],
    ["wheat", "wheat"],
    ["soy", "soy"],
    ["sesame", "sesame"],
  ]);

  return uniqueStrings(
    [...fieldMap]
      .filter(([field, allergen]) => {
        const presence = itemAllergens?.[field]?.presence;
        return availableIds.has(allergen) && [0, 1, 2].includes(presence);
      })
      .map(([, allergen]) => allergen),
  ).sort();
}

function nutritionixAllergens(allergens = {}) {
  const fieldMap = new Map([
    ["gluten", "gluten"],
    ["milk", "milk"],
    ["eggs", "egg"],
    ["fish", "fish"],
    ["shellfish", "shellfish"],
    ["crustaceanShellfish", "shellfish"],
    ["molluscanShellfish", "shellfish"],
    ["treeNuts", "tree-nut"],
    ["peanuts", "peanut"],
    ["wheat", "wheat"],
    ["soy", "soy"],
    ["sesame", "sesame"],
  ]);
  const direct = [];
  const mayContain = [];

  for (const [field, allergen] of fieldMap) {
    const value = allergens?.[field]?.presence;

    if (value === 1) {
      direct.push(allergen);
    } else if (value === 2) {
      mayContain.push(allergen);
    }
  }

  return {
    allergens: uniqueStrings(direct),
    mayContain: uniqueStrings(mayContain),
  };
}

async function fetchRbiSanityOfficialRecords(
  source,
  { endpoint, rootField, sourceLabel },
) {
  const publicMenu = await fetchRbiSanityPublicMenuEntries(source, endpoint);
  const query = `query {
    ${rootField}(limit: 2500) {
      _id
      name { en }
      internalName
      isDummyItem
      showInStaticMenu
      allergens {
        milk
        eggs
        fish
        peanuts
        shellfish
        treeNuts
        soy
        wheat
        mustard
        sesame
        celery
        lupin
        gluten
        sulphurDioxide
      }
      nutrition {
        calories
        fat
        saturatedFat
        cholesterol
        sodium
        carbohydrates
        sugar
        proteins
        weight
      }
      nutritionWithModifiers {
        calories
        fat
        saturatedFat
        cholesterol
        sodium
        carbohydrates
        sugar
        proteins
        weight
      }
      image { asset { url } }
      images { app { asset { url } } }
      productHierarchy { L1 L2 L3 L4 L5 }
    }
  }`;
  const fetched = await fetchJsonPostSource(endpoint, source, sourceTypes.api, {
    query,
  });
  const sources = [...publicMenu.sources, fetched.manifest];

  if (!fetched.ok || fetched.contentKind !== "json") {
    return { records: [], sources };
  }

  const parsed = parseJsonLoose(fetched.text);
  const items = asArray(parsed?.data?.[rootField]);
  const shouldUsePublicMenu = publicMenu.entries.size >= 20;

  return {
    records: items
      .map((item) => {
        const name = cleanText(item?.name?.en ?? item?.internalName);
        const publicMenuEntry = publicMenu.entries.get(item?._id);
        const allergenResult = rbiSanityAllergens(item?.allergens);
        const hierarchy = item?.productHierarchy ?? {};
        const category =
          publicMenuEntry?.category ??
          cleanText(hierarchy.L2) ??
          cleanText(hierarchy.L1) ??
          cleanText(hierarchy.L3) ??
          source.category;

        if (
          !name ||
          (shouldUsePublicMenu && !publicMenuEntry) ||
          !isProbablyMenuItemName(name) ||
          !isProbablyMenuCatalogRecord({
            category,
            name,
          }) ||
          item?.isDummyItem ||
          /^(offer|combo item|bundle|\$?\d+\s*off)\b/i.test(name) ||
          /^non food$/i.test(cleanText(hierarchy.L1) ?? "") ||
          !allergenResult.hasOfficialFlags
        ) {
          return null;
        }

        return createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens: allergenResult.allergens,
          officialAllergenCoveredIds: allergenResult.coveredAllergenIds,
          category: titleCase(category),
          description: sourceLabel,
          imageUrl:
            item?.image?.asset?.url ?? item?.images?.app?.asset?.url ?? null,
          mayContain: allergenResult.mayContain,
          name,
          nutritionFacts: nutritionFactsFromRbiNutrition(
            item.nutritionWithModifiers ?? item.nutrition,
          ),
          sourceKind: "official-api",
          sourceUrl: endpoint,
          variantGroup: item._id,
        });
      })
      .filter(Boolean),
    sources,
  };
}

async function fetchRbiSanityPublicMenuEntries(source, endpoint) {
  const itemFields = "_id _type name { en } internalName";
  const comboFields = `_id _type name { en } internalName mainItem { ${itemFields} }`;
  const query = `query {
    allFeatureMenus(limit: 1) {
      defaultMenu {
        options {
          __typename
          ... on Item { ${itemFields} }
          ... on Combo { ${comboFields} }
          ... on Picker {
            _id _type name { en } internalName
            options {
              option {
                __typename
                ... on Item { ${itemFields} }
                ... on Combo { ${comboFields} }
              }
            }
          }
          ... on Section {
            _id _type name { en } internalName hiddenFromMainMenu
            options {
              __typename
              ... on Item { ${itemFields} }
              ... on Combo { ${comboFields} }
              ... on Picker {
                _id _type name { en } internalName
                options {
                  option {
                    __typename
                    ... on Item { ${itemFields} }
                    ... on Combo { ${comboFields} }
                  }
                }
              }
            }
          }
        }
      }
    }
  }`;
  const fetched = await fetchJsonPostSource(endpoint, source, sourceTypes.api, {
    query,
  });
  const sources = [fetched.manifest];

  if (!fetched.ok || fetched.contentKind !== "json") {
    return { entries: new Map(), sources };
  }

  const parsed = parseJsonLoose(fetched.text);
  const entries = new Map();

  for (const featureMenu of asArray(parsed?.data?.allFeatureMenus)) {
    for (const option of asArray(featureMenu?.defaultMenu?.options)) {
      collectRbiPublicMenuEntry(entries, option, source.category);
    }
  }

  return { entries, sources };
}

function collectRbiPublicMenuEntry(entries, node, category) {
  if (!node || typeof node !== "object") {
    return;
  }

  if (node.__typename === "Section") {
    if (node.hiddenFromMainMenu) {
      return;
    }

    const nextCategory =
      cleanText(node?.name?.en ?? node?.internalName) ?? category;

    for (const option of asArray(node.options)) {
      collectRbiPublicMenuEntry(entries, option, nextCategory);
    }

    return;
  }

  if (node.__typename === "Picker") {
    for (const option of asArray(node.options)) {
      collectRbiPublicMenuEntry(entries, option?.option, category);
    }

    return;
  }

  if (node.__typename === "Combo") {
    collectRbiPublicMenuEntry(entries, node.mainItem ?? null, category);
    return;
  }

  if (node.__typename !== "Item") {
    return;
  }

  const name = cleanText(node?.name?.en ?? node?.internalName);

  if (
    !node._id ||
    !name ||
    !isProbablyMenuItemName(name) ||
    !isProbablyMenuCatalogRecord({ category, name })
  ) {
    return;
  }

  entries.set(node._id, {
    category,
    name,
  });
}

function nutritionFactsFromRbiNutrition(nutrition) {
  if (!nutrition || typeof nutrition !== "object") {
    return undefined;
  }

  return normalizeNutritionFacts({
    Calories: nutrition.calories,
    "Total Fat": nutrition.fat,
    "Saturated Fat": nutrition.saturatedFat,
    Cholesterol: nutrition.cholesterol,
    Sodium: nutrition.sodium,
    "Total Carbohydrates": nutrition.carbohydrates,
    Sugars: nutrition.sugar,
    Protein: nutrition.proteins,
    "Serving Weight": nutrition.weight,
  });
}

export function rbiSanityAllergens(allergens = {}) {
  const fieldMap = new Map([
    ["milk", "milk"],
    ["eggs", "egg"],
    ["fish", "fish"],
    ["peanuts", "peanut"],
    ["shellfish", "shellfish"],
    ["treeNuts", "tree-nut"],
    ["soy", "soy"],
    ["wheat", "wheat"],
    ["mustard", "mustard"],
    ["sesame", "sesame"],
    ["gluten", "gluten"],
    ["sulphurDioxide", "sulfites"],
  ]);
  const direct = [];
  const mayContain = [];
  const coveredAllergenIds = [];
  let hasOfficialFlags = false;

  for (const [field, allergen] of fieldMap) {
    const value = allergens?.[field];

    if (typeof value !== "number") {
      continue;
    }

    hasOfficialFlags = true;
    coveredAllergenIds.push(allergen);

    if (value >= 3) {
      direct.push(allergen);
    } else if (value > 0) {
      mayContain.push(allergen);
    }
  }

  return {
    allergens: uniqueStrings(direct),
    coveredAllergenIds: uniqueStrings(coveredAllergenIds).sort(),
    hasOfficialFlags,
    mayContain: uniqueStrings(mayContain),
  };
}

async function fetchWhataburgerOfficialMenuRecords(source) {
  const menuUrl = "https://api.whataburger.com/v2.4/menu";
  const fetched = await fetchSource(menuUrl, source, sourceTypes.api, {
    accept: "application/json",
    "x-api-key": "E08F3550-23FE-4360-BD6C-08314E6C3E2F",
  });
  const sources = [fetched.manifest];

  if (!fetched.ok || fetched.contentKind !== "json") {
    return { records: [], sources };
  }

  const parsed = parseJsonLoose(fetched.text);
  const ingredientById = new Map(
    asArray(parsed.ingredients).map((ingredient) => [
      ingredient.id,
      ingredient,
    ]),
  );
  const modifierGroupById = new Map(
    asArray(parsed.modifierGroups).map((group) => [group.id, group]),
  );
  const records = [];

  for (const category of asArray(parsed.categories)) {
    for (const group of asArray(category.recipes)) {
      for (const recipe of asArray(group.recipes)) {
        const name = cleanText(recipe.name);

        if (!name || !isProbablyMenuItemName(name)) {
          continue;
        }

        const ingredientRefs = [
          ...asArray(recipe.ingredients),
          ...whataburgerDefaultModifierIngredients(recipe, modifierGroupById),
        ];
        const ingredientsText =
          cleanText(recipe.longDescription) ??
          whataburgerIngredientsText(ingredientRefs, ingredientById);
        const allergens = ingredientRefs.flatMap((ref) =>
          asArray(ingredientById.get(ref.ingredientId)?.allergens).map(
            (allergen) => allergen?.slug ?? allergen?.name,
          ),
        );
        const nutritionFacts = nutritionFactsFromWhataburgerIngredients(
          ingredientRefs,
          ingredientById,
        );

        records.push(
          createRecord({
            allergenSourceType: allergenSourceTypes.officialAllergenMenu,
            allergens: normalizeProviderAllergens(allergens),
            category: cleanText(category.name) ?? source.category,
            description:
              recipe.description ??
              recipe.shortDescription ??
              recipe.longDescription ??
              null,
            imageUrl: whataburgerImageUrl(recipe.imageUrl),
            ingredientsText,
            isConfigurable: asArray(recipe.recipeModifiers).length > 0,
            mayContain: [],
            name,
            nutritionFacts,
            sourceKind: "official-api",
            sourceUrl: fetched.finalUrl,
            variantGroup: recipe.id,
          }),
        );
      }
    }
  }

  return { records, sources };
}

function whataburgerDefaultModifierIngredients(recipe, modifierGroupById) {
  const ingredientRefs = [];

  for (const recipeModifier of asArray(recipe.recipeModifiers)) {
    const group = modifierGroupById.get(recipeModifier.modifierGroupId);
    const modifier = asArray(group?.modifiers).find(
      (candidate) =>
        candidate.id === recipeModifier.defaultModifierId ||
        candidate.isDefaultSelected,
    );

    ingredientRefs.push(...asArray(modifier?.ingredients));
  }

  return ingredientRefs;
}

function whataburgerIngredientsText(ingredientRefs, ingredientById) {
  const names = uniqueStrings(
    ingredientRefs
      .map((ref) => ingredientById.get(ref.ingredientId))
      .map(
        (ingredient) =>
          cleanText(ingredient?.name ?? ingredient?.displayName) ??
          titleCase(String(ingredient?.slug ?? "").replace(/-/g, " ")),
      )
      .filter((name) => !/\b(?:calories?|allergen placeholder)\b/i.test(name))
      .filter(Boolean),
  );

  return names.length > 0 ? names.join(", ") : null;
}

function nutritionFactsFromWhataburgerIngredients(
  ingredientRefs,
  ingredientById,
) {
  const fieldLabels = new Map([
    ["calories", "Calories"],
    ["caloriesFromFat", "Calories from Fat"],
    ["totalFat", "Total Fat"],
    ["saturatedFat", "Saturated Fat"],
    ["transFat", "Trans Fat"],
    ["cholesterol", "Cholesterol"],
    ["sodium", "Sodium"],
    ["carbs", "Total Carbohydrates"],
    ["dietaryFiber", "Dietary Fiber"],
    ["sugars", "Sugars"],
    ["protein", "Protein"],
    ["calcium", "Calcium"],
    ["iron", "Iron"],
    ["potassium", "Potassium"],
  ]);
  const facts = {};

  for (const ref of ingredientRefs) {
    const ingredient = ingredientById.get(ref.ingredientId);
    const nutrition = ingredient?.nutritionInfo;
    const multiplier = Number.isFinite(Number(ref.multiplier))
      ? Number(ref.multiplier)
      : 1;

    if (!nutrition || typeof nutrition !== "object") {
      continue;
    }

    for (const [field, label] of fieldLabels) {
      const value = parseNutritionNumber(nutrition[field]);

      if (value !== null) {
        facts[label] = (facts[label] ?? 0) + value * multiplier;
      }
    }
  }

  return normalizeNutritionFacts(
    Object.fromEntries(
      Object.entries(facts).map(([label, value]) => [
        label,
        roundNutritionValue(value),
      ]),
    ),
  );
}

function whataburgerImageUrl(imageUrl) {
  const cleaned = cleanText(imageUrl);

  if (!cleaned) {
    return null;
  }

  if (/^https?:\/\//i.test(cleaned)) {
    return cleaned;
  }

  return `https://wbimageserver.whataburger.com/${cleaned}`;
}

async function fetchWendysOfficialNutritionRecords(source) {
  const baseUrl = "https://api.app.prd.wendys.digital/web-client-gateway";
  const commonParams =
    "channel=WEB&lang=en&cntry=US&sourceCode=ORDER.WENDYS&version=2.3.1";
  const menuUrl = `${baseUrl}/menu/getSiteMenu?siteNum=0&freeStyleMenu=true&menuChannel=WEB_GUEST&${commonParams}`;
  const menuSource = await fetchSource(menuUrl, source, sourceTypes.api);
  const sources = [menuSource.manifest];

  if (!menuSource.ok || menuSource.contentKind !== "json") {
    return { records: [], sources };
  }

  const parsed = parseJsonLoose(menuSource.text);
  const menu = parsed?.menuLists;

  if (!menu?.menuItems || !menu?.salesItems) {
    return { records: [], sources };
  }

  const salesById = new Map(
    menu.salesItems.map((item) => [item.salesItemId, item]),
  );
  const categoryByMenuItemId = new Map();

  for (const subMenu of menu.subMenus ?? []) {
    for (const menuItemId of subMenu.menuItems ?? []) {
      categoryByMenuItemId.set(
        menuItemId,
        cleanText(subMenu.displayName ?? subMenu.name),
      );
    }
  }

  const records = [];
  const rows = menu.menuItems
    .map((item) => ({ item, salesItem: salesById.get(item.defaultItemId) }))
    .filter(({ item, salesItem }) => item?.displayName && salesItem?.productId);

  for (let index = 0; index < rows.length; index += 12) {
    const batch = rows.slice(index, index + 12);
    const batchResults = await Promise.all(
      batch.map(async ({ item, salesItem }) => {
        const request = {
          siteNum: 0,
          products: [{ id: salesItem.productId, components: [] }],
        };
        const url = `${baseUrl}/NutritionServices/rest/nutritionalData?data=${encodeURIComponent(
          JSON.stringify(request),
        )}&${commonParams}`;
        const fetched = await fetchSource(url, source, sourceTypes.api);
        const nutrition = parseJsonLoose(fetched.text);

        return { fetched, item, nutrition, salesItem };
      }),
    );

    for (const { fetched, item, nutrition, salesItem } of batchResults) {
      sources.push(fetched.manifest);

      if (
        !fetched.ok ||
        nutrition?.serviceStatus !== "SUCCESS" ||
        !nutrition.data
      ) {
        continue;
      }

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens: wendysNutritionAllergens(nutrition.data),
          officialAllergenCoveredIds:
            wendysNutritionAllergenCoverage(nutrition.data),
          category:
            categoryByMenuItemId.get(item.menuItemId) ??
            cleanText(salesItem.categoryName) ??
            source.category,
          description: item.description ?? salesItem.description ?? null,
          imageUrl: wendysImageUrl(item.baseImageName ?? salesItem.productId),
          ingredientsText: stringifySelectedFields(nutrition.data, [
            "ingredients",
            "ingredientStatement",
            "ingredientStatements",
          ]),
          mayContain: [],
          name: item.displayName,
          nutritionFacts: nutritionFactsFromObject(nutrition.data),
          sourceKind: "official-api",
          sourceUrl: fetched.finalUrl,
        }),
      );
    }
  }

  return { records, sources };
}

export function wendysImageUrl(imageId) {
  const cleaned = cleanText(imageId);

  return cleaned
    ? `https://app.wendys.com/unified/assets/menu/pg-cropped/${encodeURIComponent(cleaned)}_small_US_en.png`
    : null;
}

async function fetchStarbucksOfficialNutritionRecords(source) {
  const menuUrl = "https://www.starbucks.com/apiproxy/v1/ordering/menu";
  const appMenuUrl = "https://app.starbucks.com/apiproxy/v1/ordering/menu";
  const sources = [];
  let fetchedMenu = await fetchStarbucksOfficialSourceWithRetry(
    menuUrl,
    source,
    sourceTypes.api,
    2,
  );
  sources.push(fetchedMenu.manifest);

  if (!fetchedMenu.ok) {
    fetchedMenu = await fetchStarbucksOfficialSourceWithRetry(
      appMenuUrl,
      source,
      sourceTypes.api,
      2,
    );
    sources.push(fetchedMenu.manifest);
  }

  const browserSnapshot = { detailByKey: new Map(), products: [], sources: [] };
  sources.push(...browserSnapshot.sources);

  const fixture = await readJsonIfExists(
    path.join(projectRoot, "data/fixtures/starbucks-official-products.json"),
  );
  const fixtureProducts = extractStarbucksProducts(fixture);
  let products = [];
  let detailByKey = new Map();

  if (fetchedMenu?.ok) {
    products = extractStarbucksProducts(parseJsonLoose(fetchedMenu.text));
  } else if (browserSnapshot.products.length > 0) {
    products = browserSnapshot.products;
    detailByKey = browserSnapshot.detailByKey;
  }

  if (products.length === 0 && fixtureProducts.length > 0) {
    sources.push({
      contentKind: "json",
      finalUrl: "data/fixtures/starbucks-official-products.json",
      kind: sourceTypes.api,
      ok: false,
      restaurantId: source.id,
      status: "fixture-disabled",
      url: "data/fixtures/starbucks-official-products.json",
    });
  }

  const records = [];
  const uniqueProducts = uniqueBy(products, (product) =>
    starbucksProductKey(product),
  );
  const liveProducts =
    browserSnapshot.products.length > 0 || fetchedMenu?.ok
      ? uniqueProducts
      : [];

  if (detailByKey.size === 0 && liveProducts.length > 0) {
    const directDetails = await fetchStarbucksDirectDetails(
      liveProducts,
      source,
    );
    detailByKey = directDetails.detailByKey;
    sources.push(...directDetails.sources);
  }

  for (const product of liveProducts) {
    const key = starbucksProductKey(product);
    const detail = detailByKey.get(key);

    if (!detail) {
      continue;
    }

    const record = starbucksRecordFromProduct(
      { ...product, ...detail, name: product.name },
      source,
      starbucksNutritionUrl(product),
    );

    if (record) {
      records.push(record);
    }
  }

  if (detailByKey.size > 0) {
    if (detailByKey.size < 150 || records.length < 100) {
      const fallback = await fetchStarbucksKnownGoodNutritionRecords(source);
      records.splice(0, records.length, ...fallback.records);
      sources.push(...fallback.sources);
    }

    return { records, sources };
  }

  for (const product of liveProducts) {
    const url = starbucksNutritionUrl(product);

    if (!url) {
      continue;
    }

    const fetched = await fetchStarbucksOfficialSourceWithRetry(
      url,
      source,
      sourceTypes.allergen,
      2,
    );
    sources.push(fetched.manifest);

    if (!fetched.ok || fetched.contentKind !== "html") {
      continue;
    }

    const parsed = parseStarbucksNutritionPage(fetched.text);
    const record = starbucksRecordFromProduct(
      { ...product, ...parsed, name: product.name },
      source,
      fetched.finalUrl,
    );

    if (record) {
      records.push(record);
    }
  }

  if (records.length < 100) {
    const fallback = await fetchStarbucksKnownGoodNutritionRecords(source);
    records.splice(0, records.length, ...fallback.records);
    sources.push(...fallback.sources);
  }

  return { records, sources };
}

async function fetchStarbucksOfficialBrowserSnapshot(source) {
  const startedAt = Date.now();
  const menuUrl = "https://www.starbucks.com/menu";
  let browser;

  try {
    const { chromium } = await runtimeImport("playwright-core");
    const executablePath = await getChromiumExecutablePath();
    let menuJson = null;
    let menuResponseMeta = null;
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ["--disable-blink-features=AutomationControlled"],
    });
    const page = await browser.newPage({ userAgent: browserUserAgent });

    page.on("response", async (response) => {
      if (
        response.url() !== "https://www.starbucks.com/apiproxy/v1/ordering/menu"
      ) {
        return;
      }

      menuResponseMeta = {
        contentType: response.headers()["content-type"] ?? "",
        finalUrl: response.url(),
        ok: response.ok(),
        status: response.status(),
      };

      if (!response.ok()) {
        return;
      }

      try {
        menuJson = await response.json();
      } catch {
        menuJson = null;
      }
    });

    await page.goto(menuUrl, {
      timeout: timeoutMs,
      waitUntil: "domcontentloaded",
    });

    for (let attempt = 0; attempt < 20 && !menuJson; attempt += 1) {
      await page.waitForTimeout(500);
    }

    const products = uniqueBy(extractStarbucksProducts(menuJson), (product) =>
      starbucksProductKey(product),
    );
    const menuBuffer = Buffer.from(
      JSON.stringify(menuJson ?? {}, null, 2),
      "utf8",
    );
    const menuHash = sha256(menuBuffer);
    const menuRawPath = writeRaw
      ? await writeRawSource(source.id, `${menuHash}.json`, menuBuffer)
      : null;
    const menuManifest = {
      browserFetched: true,
      bytes: menuBuffer.length,
      contentKind: "json",
      contentType: menuResponseMeta?.contentType ?? "application/json",
      durationMs: Date.now() - startedAt,
      finalUrl:
        menuResponseMeta?.finalUrl ??
        "https://www.starbucks.com/apiproxy/v1/ordering/menu",
      hash: menuHash,
      kind: sourceTypes.api,
      ok: products.length > 0,
      rawPath: menuRawPath ? path.relative(projectRoot, menuRawPath) : null,
      restaurantId: source.id,
      status:
        menuResponseMeta?.status ??
        (products.length > 0 ? 200 : "browser-error"),
      url: "https://www.starbucks.com/apiproxy/v1/ordering/menu",
    };

    if (products.length === 0) {
      return {
        detailByKey: new Map(),
        products: [],
        sources: [menuManifest],
      };
    }

    const detailRequests = products
      .map((product) => ({
        key: starbucksProductKey(product),
        url: starbucksDetailApiUrl(product),
      }))
      .filter((request) => request.key && request.url);
    const detailStartedAt = Date.now();
    const detailResponses = await page.evaluate(async (requests) => {
      const results = [];
      const delayMs = 350;
      let nextIndex = 0;

      async function worker() {
        while (nextIndex < requests.length) {
          const request = requests[nextIndex];
          nextIndex += 1;

          try {
            if (nextIndex > 1) {
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            }

            const response = await fetch(request.url, {
              headers: {
                Accept: "application/json",
                "X-Requested-With": "XMLHttpRequest",
              },
            });
            results.push({
              key: request.key,
              ok: response.ok,
              status: response.status,
              text: await response.text(),
              url: response.url,
            });
          } catch (error) {
            results.push({
              error:
                error instanceof Error
                  ? error.message
                  : "Unknown Starbucks detail fetch error",
              key: request.key,
              ok: false,
              status: "error",
              text: "",
              url: request.url,
            });
          }
        }
      }

      await worker();
      return results;
    }, detailRequests);
    const detailByKey = new Map();

    for (const response of detailResponses) {
      if (!response.ok) {
        continue;
      }

      const parsed = parseJsonLoose(response.text);
      const productDetail = Array.isArray(parsed?.products)
        ? parsed.products[0]
        : null;
      const detail = parseStarbucksProductDetail(productDetail);

      if (detail) {
        detailByKey.set(response.key, detail);
      }
    }

    const detailsBuffer = Buffer.from(
      JSON.stringify(
        detailResponses.map((response) => ({
          key: response.key,
          ok: response.ok,
          status: response.status,
          url: response.url,
        })),
        null,
        2,
      ),
      "utf8",
    );
    const detailsHash = sha256(detailsBuffer);
    const detailsRawPath = writeRaw
      ? await writeRawSource(source.id, `${detailsHash}.json`, detailsBuffer)
      : null;
    const okDetails = detailResponses.filter((response) => response.ok).length;
    const detailsManifest = {
      browserFetched: true,
      bytes: detailResponses.reduce(
        (sum, response) => sum + Buffer.byteLength(response.text ?? ""),
        0,
      ),
      contentKind: "json",
      contentType: "application/json",
      detailCount: detailResponses.length,
      durationMs: Date.now() - detailStartedAt,
      finalUrl:
        "https://www.starbucks.com/apiproxy/v1/ordering/{productNumber}/{formCode}",
      hash: detailsHash,
      kind: sourceTypes.allergen,
      ok: okDetails === detailRequests.length,
      okDetailCount: okDetails,
      parsedDetailCount: detailByKey.size,
      rawPath: detailsRawPath
        ? path.relative(projectRoot, detailsRawPath)
        : null,
      restaurantId: source.id,
      status: okDetails === detailRequests.length ? 200 : "partial",
      url: "https://www.starbucks.com/apiproxy/v1/ordering/{productNumber}/{formCode}",
    };

    return {
      detailByKey,
      products,
      sources: [menuManifest, detailsManifest],
    };
  } catch (error) {
    return {
      detailByKey: new Map(),
      products: [],
      sources: [
        {
          browserFetched: true,
          contentKind: "error",
          durationMs: Date.now() - startedAt,
          error:
            error instanceof Error
              ? error.message
              : "Unknown Starbucks browser fetch error",
          finalUrl: menuUrl,
          kind: sourceTypes.api,
          ok: false,
          restaurantId: source.id,
          status: "error",
          url: menuUrl,
        },
      ],
    };
  } finally {
    await browser?.close();
  }
}

function failedConfiguredMenuFallbackUrls(source, entry) {
  if (!entry?.configured || entry.kind !== sourceTypes.menu) {
    return [];
  }

  const domain = cleanText(source.domain);

  if (!domain) {
    return [];
  }

  const normalizedDomain = domain
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "");

  if (!normalizedDomain || !normalizedDomain.includes(".")) {
    return [];
  }

  return uniqueStrings([
    `https://${normalizedDomain}/`,
    `https://${normalizedDomain}/menu`,
    `https://${normalizedDomain}/menus`,
  ]);
}

async function fetchStarbucksKnownGoodNutritionRecords(source) {
  const fixturePath = path.join(
    projectRoot,
    "data/fixtures/starbucks-official-nutrition-snapshot.json",
  );
  const fixture = await readJsonIfExists(fixturePath);
  const records = asArray(fixture?.items)
    .filter(
      (item) =>
        item?.nutritionFacts && Object.keys(item.nutritionFacts).length > 0,
    )
    .map((item) =>
      createRecord({
        allergenSourceType:
          item.allergenSourceType ??
          allergenSourceTypes.officialProductAllergenSection,
        allergens: item.allergens ?? [],
        category: item.category ?? source.category,
        description:
          cleanText(item.description) ??
          "Previous known-good official Starbucks product nutrition detail.",
        imageUrl: item.imageUrl ?? null,
        ingredientsText: item.ingredientsText,
        isConfigurable: item.isConfigurable ?? false,
        mayContain: item.mayContain ?? [],
        name: item.name,
        nutritionFacts: item.nutritionFacts,
        sourceKind: "official-api",
        sourceUrl:
          item.sourceUrls?.[0] ??
          "data/fixtures/starbucks-official-nutrition-snapshot.json",
        variantGroup: item.variantGroup ?? item.category ?? source.category,
      }),
    );

  return {
    records,
    sources: [
      {
        contentKind: "json",
        finalUrl: "data/fixtures/starbucks-official-nutrition-snapshot.json",
        itemCount: records.length,
        kind: sourceTypes.api,
        ok: records.length > 0,
        restaurantId: source.id,
        status: records.length > 0 ? "previous-known-good" : "missing",
        url: "data/fixtures/starbucks-official-nutrition-snapshot.json",
      },
    ],
  };
}

async function fetchKnownGoodNutritionFixtureRecords(
  source,
  { filename, sourceLabel },
) {
  const fixture = await readJsonIfExists(
    path.join(projectRoot, "data/fixtures", filename),
  );
  const records = asArray(fixture?.items)
    .filter(
      (item) =>
        item?.nutritionFacts && Object.keys(item.nutritionFacts).length > 0,
    )
    .map((item) =>
      createRecord({
        allergenSourceType:
          item.allergenSourceType ?? allergenSourceTypes.unavailable,
        allergens: item.allergens ?? [],
        category: item.category ?? source.category,
          description:
            item.description ?? item.longDescription ?? sourceLabel,
        imageUrl: item.imageUrl ?? null,
        ingredientsText: item.ingredientsText,
        mayContain: item.mayContain ?? [],
        name: item.name,
        nutritionFacts: item.nutritionFacts,
        sourceKind: "official-api",
        sourceUrl: item.sourceUrls?.[0] ?? `data/fixtures/${filename}`,
        variantGroup: item.variantGroup ?? item.category ?? source.category,
      }),
    );

  return {
    records,
    sources: [
      {
        contentKind: "json",
        finalUrl: `data/fixtures/${filename}`,
        itemCount: records.length,
        kind: sourceTypes.api,
        ok: records.length > 0,
        restaurantId: source.id,
        status: records.length > 0 ? "previous-known-good" : "missing",
        url: `data/fixtures/${filename}`,
      },
    ],
  };
}

async function fetchSupabaseMenuCategoryRecords(
  source,
  { apiUrl, anonKey, sourceLabel },
) {
  const headers = {
    accept: "application/json",
    apikey: anonKey,
    authorization: `Bearer ${anonKey}`,
  };
  const fetched = await fetchSource(
    apiUrl,
    { ...source, forceBrowserFetch: false, useBrowserFetch: false },
    sourceTypes.api,
    { extraHeaders: headers },
  );

  if (!fetched.ok) {
    return {
      records: [],
      sources: [
        {
          contentKind: "json",
          finalUrl: fetched.finalUrl ?? apiUrl,
          itemCount: 0,
          kind: sourceTypes.api,
          ok: false,
          restaurantId: source.id,
          status: fetched.status ?? "failed",
          url: apiUrl,
        },
      ],
    };
  }

  const categories = parseJsonLoose(fetched.text);
  const records = asArray(categories).flatMap((category) => {
    const categoryName = cleanText(category?.name);
    const menuType = cleanText(category?.menu_type);
    const categoryLabel =
      [menuType, categoryName].filter(Boolean).join(" - ") || source.category;

    if (isSupabaseMenuBeverageCategory(categoryName, menuType)) {
      return [];
    }

    return asArray(category?.menu_items)
      .map((item) => {
        const name = cleanMenuName(item?.name);

        if (!name || isSupabaseMenuBeverageItem(name, categoryName, menuType)) {
          return null;
        }

        const description = cleanText(
          [item?.description, item?.price].filter(Boolean).join(" "),
        );
        return createRecord({
          allergenSourceType: allergenSourceTypes.unavailable,
          allergens: [],
          category: categoryLabel,
          description: description ?? sourceLabel,
          imageUrl: null,
          ingredientsText: null,
          mayContain: [],
          name,
          sourceKind: "supabase-menu-api",
          sourceUrl: fetched.finalUrl ?? apiUrl,
          variantGroup: categoryLabel,
        });
      })
      .filter(Boolean);
  });

  return {
    records,
    sources: [
      {
        contentKind: "json",
        finalUrl: fetched.finalUrl ?? apiUrl,
        itemCount: records.length,
        kind: sourceTypes.api,
        ok: records.length > 0,
        restaurantId: source.id,
        role: "menu-api",
        status: records.length > 0 ? "supabase-menu-api" : "empty",
        url: apiUrl,
      },
    ],
  };
}

function isSupabaseMenuBeverageCategory(categoryName, menuType) {
  const text = `${categoryName ?? ""} ${menuType ?? ""}`;
  return (
    /^(?:drinks?|beverages?|bar|beer|wine|cocktails?|mocktails?)$/i.test(
      String(categoryName ?? "").trim(),
    ) || /\b(?:beverage|beer|wine|cocktail|mocktail|drinks?)\b/i.test(text)
  );
}

function isSupabaseMenuBeverageItem(name, categoryName, menuType) {
  const text = `${name ?? ""} ${categoryName ?? ""} ${menuType ?? ""}`;

  if (
    /\b(?:draft beers?|bottled beers?|wine|cocktails?|mocktails?|sangria|mimosa|martini|spritz)\b/i.test(
      text,
    )
  ) {
    return true;
  }

  return false;
}

async function fetchMenufyCategoryApiRecords(source, { apiUrl, sourceLabel }) {
  const fetched = await fetchSource(
    apiUrl,
    { ...source, forceBrowserFetch: false, useBrowserFetch: false },
    sourceTypes.api,
    { extraHeaders: { accept: "application/json" } },
  );

  if (!fetched.ok) {
    return {
      records: [],
      sources: [
        {
          contentKind: "json",
          finalUrl: fetched.finalUrl ?? apiUrl,
          itemCount: 0,
          kind: sourceTypes.api,
          ok: false,
          restaurantId: source.id,
          status: fetched.status ?? "failed",
          url: apiUrl,
        },
      ],
    };
  }

  const parsed = parseJsonLoose(fetched.text);
  const categories = asArray(parsed?.categories);
  const records = categories.flatMap((category) => {
    const categoryName = cleanText(category?.name) ?? source.category;

    if (isMenufyBeverageCategory(categoryName)) {
      return [];
    }

    return asArray(category?.items)
      .filter((item) => item?.isActive !== false && item?.isDeleted !== true)
      .map((item) => {
        const name = cleanMenuName(item?.name);

        if (!name || isMenufyBeverageItem(name, categoryName)) {
          return null;
        }

        const price = Number.isFinite(Number(item?.itemPrice))
          ? `$${Number(item.itemPrice).toFixed(2)}`
          : null;
        const description = cleanText(
          [item?.description, price].filter(Boolean).join(" "),
        );

        return createRecord({
          allergenSourceType: allergenSourceTypes.unavailable,
          allergens: [],
          category: categoryName,
          description: description ?? sourceLabel,
          imageUrl: item?.imageLink || null,
          ingredientsText: null,
          mayContain: [],
          name,
          sourceKind: "menufy-category-api",
          sourceUrl: fetched.finalUrl ?? apiUrl,
          variantGroup: categoryName,
        });
      })
      .filter(Boolean);
  });

  return {
    records,
    sources: [
      {
        contentKind: "json",
        finalUrl: fetched.finalUrl ?? apiUrl,
        itemCount: records.length,
        kind: sourceTypes.api,
        ok: records.length > 0,
        restaurantId: source.id,
        role: "menu-api",
        status: records.length > 0 ? "menufy-category-api" : "empty",
        url: apiUrl,
      },
    ],
  };
}

function isMenufyBeverageCategory(categoryName) {
  return /\b(?:beverages?|drinks?|beer|wine|cocktails?|mocktails?)\b/i.test(
    String(categoryName ?? ""),
  );
}

function isMenufyBeverageItem(name, categoryName) {
  const text = `${name ?? ""} ${categoryName ?? ""}`;
  return /\b(?:beverage|beer|wine|cocktail|mocktail|soda|tea|coffee|lemonade)\b/i.test(
    text,
  );
}

async function fetchReviewedOfficialMenuFixtureRecords(
  source,
  { filename, sourceLabel },
) {
  const fixture = await readJsonIfExists(
    path.join(projectRoot, "data/fixtures", filename),
  );
  const sourceUrls = asArray(fixture?.sourceUrls).filter(Boolean);
  const records = asArray(fixture?.items)
    .map((item) => {
      const name = cleanMenuName(item?.name);

      if (!name) {
        return null;
      }

      return createRecord({
        allergenSourceType:
          item.allergenSourceType ??
          (asArray(item.allergens).length > 0 ||
          asArray(item.mayContain).length > 0
            ? allergenSourceTypes.officialProductAllergenSection
            : allergenSourceTypes.unavailable),
        allergens: asArray(item.allergens),
        category: cleanText(item.category) ?? source.category,
        description: cleanText(item.description) ?? sourceLabel,
        imageUrl: item.imageUrl ?? null,
        ingredientsText: null,
        mayContain: asArray(item.mayContain),
        name,
        sourceKind:
          item.sourceKind ??
          fixture?.sourceKind ??
          "reviewed-official-image-menu",
        sourceUrl:
          item.sourceUrl ?? sourceUrls[0] ?? `data/fixtures/${filename}`,
        variantGroup: cleanText(item.category) ?? source.category,
      });
    })
    .filter(Boolean);

  return {
    records,
    sources: [
      {
        contentKind: "json",
        finalUrl: `data/fixtures/${filename}`,
        itemCount: records.length,
        kind: sourceTypes.menu,
        ok: records.length > 0,
        restaurantId: source.id,
        role: fixture?.role ?? "reviewed-official-image-menu",
        sourceUrls,
        status: records.length > 0 ? "reviewed-fixture" : "missing",
        url: `data/fixtures/${filename}`,
      },
    ],
  };
}

async function fetchStarbucksDirectDetails(products, source) {
  const detailByKey = new Map();
  const sources = [];
  const startedAt = Date.now();
  let consecutiveFailures = 0;

  for (const product of products) {
    if (Date.now() - startedAt > 30000) {
      break;
    }

    const key = starbucksProductKey(product);
    const primaryUrl = starbucksDetailApiUrl(product);

    if (!key || !primaryUrl) {
      continue;
    }

    const urls = uniqueStrings([
      primaryUrl,
      primaryUrl.replace(
        "https://www.starbucks.com/",
        "https://app.starbucks.com/",
      ),
    ]);
    let parsedDetail = null;

    for (const url of urls) {
      const fetched = await fetchStarbucksOfficialSourceWithRetry(
        url,
        source,
        sourceTypes.api,
        2,
      );
      sources.push(fetched.manifest);

      if (!fetched.ok || fetched.contentKind !== "json") {
        consecutiveFailures += 1;
        continue;
      }

      const parsed = parseJsonLoose(fetched.text);
      const productDetail = Array.isArray(parsed?.products)
        ? parsed.products[0]
        : null;
      parsedDetail = parseStarbucksProductDetail(productDetail);

      if (
        parsedDetail?.nutritionFacts &&
        Object.keys(parsedDetail.nutritionFacts).length > 0
      ) {
        consecutiveFailures = 0;
        break;
      }

      consecutiveFailures += 1;
    }

    if (
      parsedDetail?.nutritionFacts &&
      Object.keys(parsedDetail.nutritionFacts).length > 0
    ) {
      detailByKey.set(key, parsedDetail);
    }

    if (detailByKey.size === 0 && consecutiveFailures >= 20) {
      break;
    }
  }

  return { detailByKey, sources };
}

function starbucksProductKey(product) {
  const productNumber = product?.productNumber;
  const formCode = cleanText(product?.formCode);

  return productNumber && formCode
    ? `${productNumber}:${formCode.toLowerCase()}`
    : null;
}

function starbucksDetailApiUrl(product) {
  const uri = cleanText(product?.uri);

  if (uri) {
    const match = uri.match(/\/product\/([^/]+)\/([^/]+)/i);

    if (match) {
      return `https://www.starbucks.com/apiproxy/v1/ordering/${match[1]}/${match[2]}`;
    }
  }

  const productNumber = product?.productNumber;
  const formCode = cleanText(product?.formCode);

  if (!productNumber || !formCode) {
    return null;
  }

  return `https://www.starbucks.com/apiproxy/v1/ordering/${productNumber}/${formCode.toLowerCase()}`;
}

function parseStarbucksProductDetail(product) {
  if (!product || typeof product !== "object") {
    return null;
  }

  const sizes = Array.isArray(product.sizes) ? product.sizes : [];
  const allergenTexts = uniqueStrings(
    sizes.map((size) => cleanText(size?.allergens?.text)).filter(Boolean),
  );
  const ingredientTexts = uniqueStrings(
    sizes
      .flatMap((size) => flattenStarbucksIngredients(size?.ingredients))
      .filter(Boolean),
  );
  const defaultSize = sizes.find((size) => size?.default) ?? sizes[0];

  return {
    allergensText: allergenTexts.join(", "),
    description: cleanText(product.description),
    imageURL: product.imageURL ?? null,
    ingredientsText: ingredientTexts.join(", "),
    nutritionFacts: nutritionFactsFromStarbucksNutrition(
      defaultSize?.nutrition,
    ),
    productType: product.productType ?? null,
  };
}

function flattenStarbucksIngredients(ingredients) {
  const names = [];

  function walk(nodes) {
    if (!Array.isArray(nodes)) {
      return;
    }

    for (const node of nodes) {
      const name = cleanText(node?.name);

      if (name) {
        names.push(name);
      }

      walk(node?.children);
    }
  }

  walk(ingredients);
  return names;
}

async function fetchStarbucksOfficialSource(
  url,
  source,
  kind,
  requestTimeoutMs = timeoutMs,
) {
  const startedAt = Date.now();

  try {
    const response = await fetchWithTimeout(url, {
      extraHeaders: {
        Accept:
          kind === sourceTypes.api
            ? "application/json"
            : "text/html,application/xhtml+xml",
        "Accept-Language": "en-US",
        Referer: "https://www.starbucks.com/menu",
      },
      timeoutMs: requestTimeoutMs,
    });
    const text = await response.text();
    const buffer = Buffer.from(text, "utf8");
    const contentType = response.headers.get("content-type") ?? "";
    const contentKind = detectContentKind(url, contentType, buffer);
    const hash = sha256(buffer);
    const rawPath = writeRaw
      ? await writeRawSource(
          source.id,
          `${hash}.${extensionFor(url, contentType)}`,
          buffer,
        )
      : null;

    return {
      contentKind,
      finalUrl: response.url,
      manifest: {
        bytes: buffer.length,
        contentKind,
        contentType,
        durationMs: Date.now() - startedAt,
        finalUrl: response.url,
        hash,
        kind,
        ok: response.ok,
        rawPath: rawPath ? path.relative(projectRoot, rawPath) : null,
        restaurantId: source.id,
        status: response.status,
        url,
      },
      ok: response.ok,
      text,
    };
  } catch (error) {
    return {
      contentKind: "error",
      finalUrl: url,
      manifest: {
        contentKind: "error",
        durationMs: Date.now() - startedAt,
        error:
          error instanceof Error
            ? error.message
            : "Unknown Starbucks fetch error",
        finalUrl: url,
        kind,
        ok: false,
        restaurantId: source.id,
        status: "error",
        url,
      },
      ok: false,
      text: "",
    };
  }
}

async function fetchStarbucksOfficialSourceWithRetry(
  url,
  source,
  kind,
  attempts = 3,
) {
  let last = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await fetchStarbucksOfficialSource(url, source, kind, 5000);

    if (
      last.ok ||
      ![403, 429, 500, 502, 503, 504, "error"].includes(last.manifest.status)
    ) {
      return last;
    }

    await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
  }

  return last;
}

function extractStarbucksProducts(parsed) {
  const products = [];

  function walk(node, category = null) {
    if (!node || typeof node !== "object") {
      return;
    }

    const nextCategory =
      typeof node.name === "string" && Array.isArray(node.products)
        ? node.name
        : category;

    if (Array.isArray(node.products)) {
      for (const product of node.products) {
        products.push({
          ...product,
          category: nextCategory ?? product.category,
        });
      }
    }

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          walk(item, nextCategory);
        }
      } else {
        walk(value, nextCategory);
      }
    }
  }

  walk(parsed);
  return products.filter(
    (product) => product?.name && (product.uri || product.sourceUrl),
  );
}

function starbucksNutritionUrl(product) {
  if (product.sourceUrl) {
    return product.sourceUrl;
  }

  const uri = cleanText(product.uri);
  return uri ? `https://www.starbucks.com/menu${uri}/nutrition` : null;
}

function parseStarbucksNutritionPage(html) {
  const $ = cheerio.load(html);
  const text = $("body").text().replace(/\s+/g, " ").trim();

  return {
    allergensText: extractBetween(text, "Allergens", "We cannot guarantee"),
    description:
      cleanText($("meta[name='description']").attr("content")) ??
      cleanText($("meta[property='og:description']").attr("content")),
    ingredientsText: extractBetween(text, "Ingredients", "Allergens"),
    name:
      cleanText($("h1").first().text()) ??
      cleanText($("meta[property='og:title']").attr("content")),
  };
}

function starbucksRecordFromProduct(product, source, sourceUrl) {
  const name = cleanText(product.name);
  const allergensText = cleanText(product.allergensText);
  const ingredientsText = cleanText(product.ingredientsText);

  if (!name || !sourceUrl || !isProbablyMenuItemName(name)) {
    return null;
  }

  const hasUnavailableAllergenText =
    /see ingredient statement|package for allergens/i.test(allergensText ?? "");
  const directAllergens =
    allergensText && !hasUnavailableAllergenText
      ? normalizeProviderAllergens(allergensText.split(/\s*,\s*/))
      : [];
  const ingredientAllergens =
    directAllergens.length === 0 && ingredientsText
      ? findAllergensInDeclaredFoodText(ingredientsText)
      : [];
  const allergens =
    directAllergens.length > 0 ? directAllergens : ingredientAllergens;
  const allergenSourceType =
    directAllergens.length > 0
      ? allergenSourceTypes.officialProductAllergenSection
      : ingredientAllergens.length > 0
        ? allergenSourceTypes.officialIngredients
        : allergenSourceTypes.unavailable;

  return createRecord({
    allergenSourceType,
    allergens,
    category: product.category ?? source.category,
    description:
      product.description ??
      (directAllergens.length > 0
        ? "Official Starbucks product nutrition allergen section."
        : "Official Starbucks product nutrition ingredient statement."),
    imageUrl: product.imageURL ?? product.imageUrl ?? null,
    ingredientsText,
    mayContain: findMayContainAllergens(
      `${allergensText ?? ""} ${ingredientsText ?? ""}`,
    ),
    name,
    nutritionFacts: product.nutritionFacts ?? nutritionFactsFromObject(product),
    sourceKind: "official-api",
    sourceUrl,
    variantGroup: product.formCode ?? null,
  });
}

function nutritionFactsFromStarbucksNutrition(nutrition) {
  if (!nutrition || typeof nutrition !== "object") {
    return undefined;
  }

  const facts = {};
  const topLevelFacts = [
    nutrition.servingSize,
    nutrition.calories,
    nutrition.caloriesFromFat,
  ];

  for (const fact of topLevelFacts) {
    const label = normalizeNutritionLabel(fact?.displayName);
    const value = fact?.value ?? fact?.displayValue;

    if (label && value !== undefined && value !== null && value !== "") {
      facts[label] = parseNutritionNumber(value) ?? cleanText(value);
    }
  }

  for (const fact of asArray(nutrition.additionalFacts)) {
    collectStarbucksNutritionFact(fact, facts);

    for (const subfact of asArray(fact?.subfacts)) {
      collectStarbucksNutritionFact(subfact, facts);
    }
  }

  return normalizeNutritionFacts(facts);
}

function collectStarbucksNutritionFact(fact, facts) {
  const label = normalizeNutritionLabel(fact?.displayName);
  const value = fact?.value ?? fact?.displayValue;

  if (label && value !== undefined && value !== null && value !== "") {
    facts[label] = parseNutritionNumber(value) ?? cleanText(value);
  }
}

function extractBetween(text, start, end) {
  const normalized = String(text);
  const startIndex = normalized.search(new RegExp(`\\b${start}\\b`, "i"));

  if (startIndex < 0) {
    return null;
  }

  const afterStart = normalized.slice(startIndex + start.length);
  const endIndex = afterStart.search(new RegExp(`\\b${end}\\b`, "i"));
  return cleanText(endIndex >= 0 ? afterStart.slice(0, endIndex) : afterStart);
}

function wendysNutritionAllergens(data) {
  return uniqueStrings([
    data.hasEgg ? "egg" : null,
    data.hasFish ? "fish" : null,
    data.hasMilk ? "milk" : null,
    data.hasPeanut ? "peanut" : null,
    data.hasSesame ? "sesame" : null,
    data.hasShellfish ? "shellfish" : null,
    data.hasSoy ? "soy" : null,
    data.hasTreenut ? "tree-nut" : null,
    data.hasWheat ? "wheat" : null,
  ]);
}

export function wendysNutritionAllergenCoverage(data) {
  const fields = [
    ["hasEgg", "egg"],
    ["hasFish", "fish"],
    ["hasMilk", "milk"],
    ["hasPeanut", "peanut"],
    ["hasSesame", "sesame"],
    ["hasShellfish", "shellfish"],
    ["hasSoy", "soy"],
    ["hasTreenut", "tree-nut"],
    ["hasWheat", "wheat"],
  ];

  return fields
    .filter(([field]) => typeof data?.[field] === "boolean")
    .map(([, allergenId]) => allergenId);
}

export async function fetchSource(url, restaurant, kind, requestOptions = {}) {
  const startedAt = Date.now();
  const normalizedRequestOptions =
    normalizeFetchSourceRequestOptions(requestOptions);

  try {
    if (
      (restaurant.useBrowserFetch && shouldUseBrowserForUrl(url)) ||
      (restaurant.forceBrowserFetch && shouldUseBrowserForUrl(url))
    ) {
      const curlResult = await fetchSourceWithCurl(
        url,
        restaurant,
        kind,
        startedAt,
      );

      if (
        shouldUseCurlResultBeforeBrowser(curlResult) &&
        !restaurant.forceBrowserFetch
      ) {
        return curlResult;
      }

      return fetchSourceWithBrowser(url, restaurant, kind, startedAt);
    }

    const response = await fetchWithTimeout(url, {
      body: normalizedRequestOptions.body,
      extraHeaders: {
        ...platformHeadersForUrl(url),
        ...normalizedRequestOptions.extraHeaders,
      },
      method: normalizedRequestOptions.method,
      timeoutMs: normalizedRequestOptions.timeoutMs,
    });
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get("content-type") ?? "";
    const hash = sha256(buffer);
    const ext = extensionFor(url, contentType);
    const rawPath = writeRaw
      ? await writeRawSource(restaurant.id, `${hash}.${ext}`, buffer)
      : null;
    const contentKind = detectContentKind(url, contentType, buffer);
    let text = "";

    if (contentKind === "pdf") {
      text = await readPdfText(buffer);
    } else if (
      contentKind === "html" ||
      contentKind === "json" ||
      contentKind === "xml" ||
      contentKind === "text"
    ) {
      text = buffer.toString("utf8");
    }

    const result = {
      contentKind,
      finalUrl: response.url,
      buffer,
      manifest: {
        bytes: buffer.length,
        contentKind,
        contentType,
        durationMs: Date.now() - startedAt,
        finalUrl: response.url,
        hash,
        kind,
        ok: response.ok,
        rawPath: rawPath ? path.relative(projectRoot, rawPath) : null,
        restaurantId: restaurant.id,
        status: response.status,
        url,
      },
      ok: response.ok,
      text,
    };

    const googleDriveDownloadUrl = directGoogleDriveDownloadUrl(response.url);

    if (
      googleDriveDownloadUrl &&
      contentKind === "html" &&
      !normalizedRequestOptions.skipGoogleDriveDownload
    ) {
      return fetchSource(googleDriveDownloadUrl, restaurant, kind, {
        ...normalizedRequestOptions,
        skipGoogleDriveDownload: true,
      });
    }

    if (
      !result.ok &&
      shouldRetryWithTlsClient(restaurant, url, result.manifest)
    ) {
      return fetchSourceWithTlsClient(url, restaurant, kind, startedAt);
    }

    if (!result.ok && shouldRetryWithCurl(result)) {
      const curlResult = await fetchSourceWithCurl(
        url,
        restaurant,
        kind,
        startedAt,
      );

      if (shouldUseCurlResultBeforeBrowser(curlResult)) {
        return curlResult;
      }
    }

    if (isUnsolvedGenericCloudflareChallenge(restaurant, result)) {
      return result;
    }

    if (!result.ok && shouldRetryWithBrowser(restaurant, result.manifest)) {
      return fetchSourceWithBrowser(url, restaurant, kind, startedAt);
    }

    if (result.ok && shouldRetryClientRenderedHtmlWithBrowser(result)) {
      return fetchSourceWithBrowser(url, restaurant, kind, startedAt);
    }

    return result;
  } catch (error) {
    if (shouldRetryWithTlsClient(restaurant, url)) {
      return fetchSourceWithTlsClient(url, restaurant, kind, startedAt, error);
    }

    if (
      (restaurant.useBrowserFetch && shouldUseBrowserForUrl(url)) ||
      browserFetchRestaurantIds.has(restaurant.id)
    ) {
      return fetchSourceWithBrowser(url, restaurant, kind, startedAt, error);
    }

    return {
      contentKind: "error",
      finalUrl: url,
      manifest: {
        contentKind: "error",
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Unknown fetch error",
        finalUrl: url,
        kind,
        ok: false,
        restaurantId: restaurant.id,
        status: "error",
        url,
      },
      ok: false,
      text: "",
    };
  }
}

function normalizeFetchSourceRequestOptions(requestOptions = {}) {
  if (!requestOptions || typeof requestOptions !== "object") {
    return { extraHeaders: {} };
  }

  const optionKeys = new Set([
    "body",
    "extraHeaders",
    "headers",
    "method",
    "skipGoogleDriveDownload",
    "timeoutMs",
  ]);
  const looksLikeFullOptions = Object.keys(requestOptions).some((key) =>
    optionKeys.has(key),
  );

  if (!looksLikeFullOptions) {
    return { extraHeaders: requestOptions };
  }

  return {
    body: requestOptions.body,
    extraHeaders: {
      ...(requestOptions.headers ?? {}),
      ...(requestOptions.extraHeaders ?? {}),
    },
    method: requestOptions.method,
    skipGoogleDriveDownload: requestOptions.skipGoogleDriveDownload === true,
    timeoutMs: requestOptions.timeoutMs,
  };
}

function shouldRetryWithTlsClient(restaurant, url, manifest = null) {
  return (
    tlsFetchPdfRestaurantIds.has(restaurant.id) &&
    /\.pdf(?:$|\?)/i.test(url) &&
    (!manifest || [403, 429, "error"].includes(manifest.status))
  );
}

function shouldRetryWithBrowser(restaurant, manifest) {
  return (
    (restaurant.useBrowserFetch &&
      shouldUseBrowserForUrl(manifest?.url ?? "")) ||
    isCloudflareChallengeManifest(manifest) ||
    (isToastTabUrl(manifest?.url) && [403, 429].includes(manifest.status)) ||
    (isOrderOnlineUrl(manifest?.url) && [403, 429].includes(manifest.status)) ||
    (browserFetchRestaurantIds.has(restaurant.id) &&
      [403, 429, 502].includes(manifest.status))
  );
}

function isUnsolvedGenericCloudflareChallenge(restaurant, result) {
  const url = result?.manifest?.url ?? "";

  return (
    isCloudflareChallengeHtml(result) &&
    !restaurant.useBrowserFetch &&
    !restaurant.forceBrowserFetch &&
    !browserFetchRestaurantIds.has(restaurant.id) &&
    !isToastTabUrl(url) &&
    !isOrderOnlineUrl(url)
  );
}

function shouldRetryClientRenderedHtmlWithBrowser(result) {
  if (
    result?.manifest?.browserFetched ||
    result?.contentKind !== "html" ||
    !shouldUseBrowserForUrl(result?.manifest?.url ?? result?.finalUrl ?? "")
  ) {
    return false;
  }

  return (
    isJavaScriptOnlyShellHtml(result) || isEmptyNextExportShellHtml(result)
  );
}

function isCloudflareChallengeManifest(manifest) {
  return (
    [403, 429].includes(manifest?.status) &&
    manifest?.contentKind === "html" &&
    shouldUseBrowserForUrl(manifest?.url ?? "")
  );
}

function shouldRetryWithCurl(result) {
  return (
    result?.manifest?.status === 403 &&
    shouldUseBrowserForUrl(result?.manifest?.url ?? "") &&
    isCloudflareChallengeHtml(result)
  );
}

function shouldUseCurlResultBeforeBrowser(result) {
  return (
    result?.ok &&
    ["html", "json", "xml", "text"].includes(result.contentKind) &&
    !isCloudflareChallengeHtml(result) &&
    !isJavaScriptOnlyShellHtml(result)
  );
}

function isCloudflareChallengeHtml(result) {
  return (
    result?.contentKind === "html" &&
    /(?:cf_chl|challenge-platform|Just a moment|Checking if the site connection is secure)/i.test(
      result.text ?? "",
    )
  );
}

function isJavaScriptOnlyShellHtml(result) {
  if (result?.contentKind !== "html") {
    return false;
  }

  const text = cleanText(stripHtmlForShellCheck(result.text ?? "")) ?? "";

  return (
    text.length < 260 &&
    /(?:you need to enable javascript|enable javascript to run this app|please enable javascript)/i.test(
      text,
    )
  );
}

function isEmptyNextExportShellHtml(result) {
  if (result?.contentKind !== "html") {
    return false;
  }

  const html = result.text ?? "";
  const text = cleanText(stripHtmlForShellCheck(html)) ?? "";

  return (
    text.length < 120 &&
    /<script[^>]+id=["']__NEXT_DATA__["']/i.test(html) &&
    /"pageProps"\s*:\s*\{\s*\}/i.test(html)
  );
}

function stripHtmlForShellCheck(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function shouldUseBrowserForUrl(url) {
  return !/\.(?:pdf|zip|gz|csv|xlsx?|docx?|png|jpe?g|webp|gif|svg)(?:[?#]|$)/i.test(
    url ?? "",
  );
}

function isToastTabUrl(url) {
  try {
    return /(^|\.)toasttab\.com$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function isOrderOnlineUrl(url) {
  try {
    return /(^|\.)order\.(?:online|store)$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

async function fetchSourceWithTlsClient(
  url,
  restaurant,
  kind,
  startedAt,
  originalError = null,
) {
  let session;
  const referer =
    restaurant.id === "qdoba"
      ? "https://www.qdoba.com/nutrition-allergens"
      : "https://www.zaxbys.com/menu/";

  try {
    const { ClientIdentifier, Session, destroyTLS, initTLS } =
      await runtimeImport("node-tls-client");
    await initTLS();
    session = new Session({
      clientIdentifier: ClientIdentifier.chrome_131,
      followRedirects: true,
      timeout: timeoutMs,
    });
    const response = await session.get(url, {
      byteResponse: true,
      headers: {
        Accept: "application/pdf,text/html,*/*",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: referer,
        "Sec-CH-UA":
          '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        "Sec-CH-UA-Mobile": "?0",
        "Sec-CH-UA-Platform": '"Windows"',
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
    });
    const responseBody = response.body ?? "";
    const base64Body = responseBody.startsWith("data:")
      ? responseBody.slice(responseBody.indexOf(",") + 1)
      : responseBody;
    const buffer = Buffer.from(base64Body, "base64");
    const contentType =
      firstHeaderValue(response.headers, "Content-Type") ?? "";
    const hash = sha256(buffer);
    const ext = extensionFor(url, contentType);
    const rawPath = writeRaw
      ? await writeRawSource(restaurant.id, `${hash}.${ext}`, buffer)
      : null;
    const contentKind = detectContentKind(url, contentType, buffer);
    const text =
      contentKind === "pdf"
        ? await readPdfText(buffer)
        : ["html", "json", "xml", "text"].includes(contentKind)
          ? buffer.toString("utf8")
          : "";

    return {
      contentKind,
      finalUrl: response.url ?? url,
      buffer,
      manifest: {
        bytes: buffer.length,
        contentKind,
        contentType,
        durationMs: Date.now() - startedAt,
        finalUrl: response.url ?? url,
        hash,
        kind,
        ok: response.ok,
        originalError:
          originalError instanceof Error ? originalError.message : null,
        rawPath: rawPath ? path.relative(projectRoot, rawPath) : null,
        restaurantId: restaurant.id,
        status: response.status,
        tlsClientFetched: true,
        url,
      },
      ok: response.ok,
      text,
    };
  } catch (error) {
    return {
      contentKind: "error",
      finalUrl: url,
      manifest: {
        contentKind: "error",
        durationMs: Date.now() - startedAt,
        error:
          error instanceof Error
            ? error.message
            : "Unknown TLS client fetch error",
        finalUrl: url,
        kind,
        ok: false,
        originalError:
          originalError instanceof Error ? originalError.message : null,
        restaurantId: restaurant.id,
        status: "error",
        tlsClientFetched: true,
        url,
      },
      ok: false,
      text: "",
    };
  } finally {
    await session?.close();

    try {
      const { destroyTLS } = await runtimeImport("node-tls-client");
      await destroyTLS();
    } catch {
      // The fetch already completed; cleanup should not mask the result.
    }
  }
}

async function fetchSourceWithCurl(
  url,
  restaurant,
  kind,
  startedAt,
  originalError = null,
) {
  const metaMarker = "\n__ALLERGY_APP_CURL_META__";

  try {
    const timeoutSeconds = Math.max(5, Math.ceil(timeoutMs / 1000));
    const { stdout, stderr } = await execFile(
      "curl",
      [
        "-L",
        "--compressed",
        "--max-time",
        String(timeoutSeconds),
        "-sS",
        "-w",
        `${metaMarker}%{http_code}\t%{url_effective}\t%{content_type}`,
        url,
      ],
      {
        encoding: "buffer",
        maxBuffer: 25 * 1024 * 1024,
        timeout: timeoutMs + 3000,
      },
    );
    const marker = Buffer.from(metaMarker);
    const markerIndex = stdout.lastIndexOf(marker);

    if (markerIndex < 0) {
      throw new Error("curl response metadata marker missing");
    }

    const body = stdout.subarray(0, markerIndex);
    const meta = stdout
      .subarray(markerIndex + marker.length)
      .toString("utf8")
      .split("\t");
    const status = Number(meta[0]) || "error";
    const finalUrl = meta[1] || url;
    const contentType = meta[2] || "";
    const hash = sha256(body);
    const ext = extensionFor(finalUrl, contentType);
    const rawPath = writeRaw
      ? await writeRawSource(restaurant.id, `${hash}.${ext}`, body)
      : null;
    const contentKind = detectContentKind(finalUrl, contentType, body);
    const text =
      contentKind === "pdf"
        ? await readPdfText(body)
        : ["html", "json", "xml", "text"].includes(contentKind)
          ? body.toString("utf8")
          : "";

    return {
      buffer: body,
      contentKind,
      finalUrl,
      manifest: {
        bytes: body.length,
        contentKind,
        contentType,
        curlFetched: true,
        durationMs: Date.now() - startedAt,
        error: stderr.length > 0 ? stderr.toString("utf8").trim() : null,
        finalUrl,
        hash,
        kind,
        ok: status >= 200 && status < 400,
        originalError:
          originalError instanceof Error ? originalError.message : null,
        rawPath: rawPath ? path.relative(projectRoot, rawPath) : null,
        restaurantId: restaurant.id,
        status,
        url,
      },
      ok: status >= 200 && status < 400,
      text,
    };
  } catch (error) {
    return {
      contentKind: "error",
      finalUrl: url,
      manifest: {
        contentKind: "error",
        curlFetched: true,
        durationMs: Date.now() - startedAt,
        error:
          error instanceof Error ? error.message : "Unknown curl fetch error",
        finalUrl: url,
        kind,
        ok: false,
        originalError:
          originalError instanceof Error ? originalError.message : null,
        restaurantId: restaurant.id,
        status: "error",
        url,
      },
      ok: false,
      text: "",
    };
  }
}

function firstHeaderValue(headers, name) {
  const direct = headers?.[name] ?? headers?.[name.toLowerCase()];

  if (Array.isArray(direct)) {
    return direct[0] ?? "";
  }

  return direct ?? "";
}

async function fetchSourceWithBrowser(
  url,
  restaurant,
  kind,
  startedAt,
  originalError = null,
) {
  let browser;

  try {
    const { chromium } = await runtimeImport("playwright-core");
    const executablePath = await getChromiumExecutablePath();
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ["--disable-blink-features=AutomationControlled"],
    });
    const page = await browser.newPage({ userAgent: browserUserAgent });
    const pdfResponseBodies = [];
    page.on("response", async (browserResponse) => {
      const responseUrl = browserResponse.url();
      const responseContentType =
        browserResponse.headers()["content-type"] ?? "";

      if (
        !/pdf/i.test(responseContentType) &&
        !/\.pdf(?:[?#]|$)|\/allergen(?:[?#]|$)/i.test(responseUrl)
      ) {
        return;
      }

      try {
        const body = Buffer.from(await browserResponse.body());

        if (body.subarray(0, 4).toString() === "%PDF") {
          pdfResponseBodies.push({
            body,
            contentType: responseContentType || "application/pdf",
            url: responseUrl,
          });
        }
      } catch {
        // Some browser-managed PDF responses do not expose bodies; keep the top-level fallback below.
      }
    });
    const response = await page.goto(url, {
      timeout: timeoutMs,
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(5000);

    let responseBody = Buffer.alloc(0);

    if (response) {
      try {
        responseBody = Buffer.from(await response.body());
      } catch {
        responseBody = Buffer.alloc(0);
      }
    }

    const pageHtml = Buffer.from(await page.content(), "utf8");
    const capturedPdf = pdfResponseBodies[0] ?? null;
    const buffer =
      capturedPdf?.body ??
      (responseBody.subarray(0, 4).toString() === "%PDF"
        ? responseBody
        : pageHtml);
    const contentType =
      capturedPdf?.contentType ??
      (buffer.subarray(0, 4).toString() === "%PDF"
        ? "application/pdf"
        : (response?.headers()["content-type"] ?? "text/html"));
    const finalUrl =
      capturedPdf?.url && !capturedPdf.url.startsWith("chrome-extension://")
        ? capturedPdf.url
        : response?.url() && !response.url().startsWith("chrome-extension://")
          ? response.url()
          : url;
    const hash = sha256(buffer);
    const ext = extensionFor(url, contentType);
    const rawPath = writeRaw
      ? await writeRawSource(restaurant.id, `${hash}.${ext}`, buffer)
      : null;
    const contentKind = detectContentKind(url, contentType, buffer);
    const text =
      contentKind === "pdf"
        ? await readPdfText(buffer)
        : ["html", "json", "xml", "text"].includes(contentKind)
          ? buffer.toString("utf8")
          : "";

    return {
      contentKind,
      finalUrl,
      buffer,
      manifest: {
        browserFetched: true,
        bytes: buffer.length,
        contentKind,
        contentType,
        durationMs: Date.now() - startedAt,
        finalUrl,
        hash,
        kind,
        ok: Boolean(response?.ok()),
        originalError:
          originalError instanceof Error ? originalError.message : null,
        rawPath: rawPath ? path.relative(projectRoot, rawPath) : null,
        restaurantId: restaurant.id,
        status: response?.status() ?? "browser-error",
        url,
      },
      ok: Boolean(response?.ok()),
      text,
    };
  } catch (error) {
    return {
      contentKind: "error",
      finalUrl: url,
      manifest: {
        browserFetched: true,
        contentKind: "error",
        durationMs: Date.now() - startedAt,
        error:
          error instanceof Error
            ? error.message
            : "Unknown browser fetch error",
        finalUrl: url,
        kind,
        ok: false,
        originalError:
          originalError instanceof Error ? originalError.message : null,
        restaurantId: restaurant.id,
        status: "error",
        url,
      },
      ok: false,
      text: "",
    };
  } finally {
    await browser?.close();
  }
}

async function getChromiumExecutablePath() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next browser path.
    }
  }

  const chromium = await runtimeImport("@sparticuz/chromium");
  return chromium.default.executablePath();
}

async function fetchJsonPostSource(url, restaurant, kind, body) {
  const startedAt = Date.now();

  try {
    const response = await fetchWithTimeout(url, {
      body: JSON.stringify(body),
      extraHeaders: { "content-type": "application/json" },
      method: "POST",
    });
    const text = await response.text();
    const buffer = Buffer.from(text, "utf8");
    const contentType = response.headers.get("content-type") ?? "";
    const hash = sha256(buffer);
    const rawPath = writeRaw
      ? await writeRawSource(restaurant.id, `${hash}.json`, buffer)
      : null;

    return {
      contentKind: detectContentKind(url, contentType, buffer),
      finalUrl: response.url,
      manifest: {
        bytes: buffer.length,
        contentKind: "json",
        contentType,
        durationMs: Date.now() - startedAt,
        finalUrl: response.url,
        hash,
        kind,
        ok: response.ok,
        rawPath: rawPath ? path.relative(projectRoot, rawPath) : null,
        restaurantId: restaurant.id,
        status: response.status,
        url,
      },
      ok: response.ok,
      text,
    };
  } catch (error) {
    return {
      contentKind: "error",
      finalUrl: url,
      manifest: {
        contentKind: "error",
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Unknown fetch error",
        finalUrl: url,
        kind,
        ok: false,
        restaurantId: restaurant.id,
        status: "error",
        url,
      },
      ok: false,
      text: "",
    };
  }
}

async function fetchJsonApiSource(url, restaurant, kind, options = {}) {
  const startedAt = Date.now();

  try {
    const response = await fetchWithTimeout(url, {
      extraHeaders: {
        accept: "application/json",
        ...(options.extraHeaders ?? {}),
      },
      method: options.method ?? "GET",
    });
    const text = await response.text();
    const buffer = Buffer.from(text, "utf8");
    const contentType = response.headers.get("content-type") ?? "";
    const hash = sha256(buffer);
    const rawPath = writeRaw
      ? await writeRawSource(restaurant.id, `${hash}.json`, buffer)
      : null;
    const json = parseJsonLoose(text);

    return {
      contentKind: "json",
      finalUrl: response.url,
      json,
      manifest: {
        bytes: buffer.length,
        contentKind: "json",
        contentType,
        durationMs: Date.now() - startedAt,
        finalUrl: response.url,
        hash,
        kind,
        ok: response.ok && Boolean(json),
        rawPath: rawPath ? path.relative(projectRoot, rawPath) : null,
        restaurantId: restaurant.id,
        status: response.status,
        url,
      },
      ok: response.ok && Boolean(json),
      text,
    };
  } catch (error) {
    return {
      contentKind: "error",
      finalUrl: url,
      json: null,
      manifest: {
        contentKind: "error",
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Unknown fetch error",
        finalUrl: url,
        kind,
        ok: false,
        restaurantId: restaurant.id,
        status: "error",
        url,
      },
      ok: false,
      text: "",
    };
  }
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? timeoutMs,
  );

  try {
    return await fetch(url, {
      body: options.body,
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "Ocp-Apim-Subscription-Key": "937624593c7048759a9657d6cb705a2b",
        "user-agent": userAgent,
        ...(options.extraHeaders ?? {}),
      },
      method: options.method ?? "GET",
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function writeRawSource(restaurantId, filename, buffer) {
  const directory = path.join(rawDir, restaurantId, rawDate);
  const output = path.join(directory, filename);
  await mkdir(directory, { recursive: true });
  await writeFile(output, buffer);
  return output;
}

async function readPdfText(buffer) {
  const { PDFParse } = await getPdfParse();
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function readPdfTables(buffer) {
  const { PDFParse } = await getPdfParse();
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getTable();
    return (result.pages ?? []).flatMap((page) => page.tables ?? []);
  } catch {
    return [];
  } finally {
    await parser.destroy();
  }
}

export function extractHtmlItems(
  html,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  const $ = cheerio.load(html);
  const baseUrl = url;
  const adapter = getBrandAdapter(restaurant.id);
  const records = [];
  const productLinks = [];
  const apiLinks = extractApiLinks($, baseUrl, restaurant);
  const brandProfile = extractHtmlDocumentSchemaProfile(
    $,
    restaurant,
    baseUrl,
    kind,
  );

  if (kind === sourceTypes.menu && isDardenPlatformUrl(baseUrl)) {
    return {
      apiLinks,
      discoveredDocuments: extractDocumentLinks($, baseUrl),
      locationPageLinks: extractLocationPageLinks($, baseUrl),
      menuPageLinks: [
        ...extractMenuPageLinks($, baseUrl),
        ...extractCommonMenuPathLinks($, baseUrl),
        ...extractSinglePlatformMenuPageLinks($, baseUrl),
        ...extractPopmenuMenuPageLinks($, restaurant, baseUrl),
        ...extractToastOrderPageLinks($, baseUrl),
        ...extractLaravelCategoryMenuLinks($, baseUrl),
      ],
      officialPageLinks: extractOfficialPageLinks($, baseUrl),
      items: [],
      productLinks: [],
    };
  }

  const jsonRecords = brandProfile?.exclusive
    ? []
    : extractJsonItemsFromHtml($, restaurant, baseUrl, kind);
  records.push(...jsonRecords);
  records.push(...(brandProfile?.items ?? []));

  if (!brandProfile?.exclusive) {
    records.push(
      ...extractHtmlAllergenMatrixItems($, restaurant, baseUrl, kind),
    );
    records.push(
      ...extractOfficialNarrativeAllergenHtmlItems(
        $,
        restaurant,
        baseUrl,
        kind,
      ),
    );
    records.push(
      ...extractImageFilenameMenuItems($, restaurant, baseUrl, kind),
    );
    records.push(
      ...extractContainsDisclosureLineItems($, restaurant, baseUrl, kind),
    );
    records.push(
      ...extractSectionTitleMenuItemBlockItems($, restaurant, baseUrl, kind),
    );
    records.push(
      ...extractDefinitionListMenuItems($, restaurant, baseUrl, kind),
    );
  }

  if (isThirdPartyMarketplaceUrl(baseUrl)) {
    return {
      apiLinks: [],
      discoveredDocuments: [],
      locationPageLinks: [],
      menuPageLinks: [],
      officialPageLinks: [],
      items: records,
      productLinks: [],
    };
  }

  const hasStructuredMenuRecords =
    kind === sourceTypes.menu &&
    jsonRecords
      .filter((record) => isProbablyMenuCatalogRecord(record))
      .filter((record) =>
        isAllowedSourceMenuCategory(restaurant, record.category),
      )
      .filter((record) => isAllowedSourceMenuName(restaurant, record.name))
      .length >= 4;

  if (
    !brandProfile?.exclusive &&
    ((adapter.allowGenericDomMenu && !hasStructuredMenuRecords) ||
      kind === sourceTypes.allergen)
  ) {
    const domResult = extractDomMenuItems($, restaurant, baseUrl, kind);
    records.push(...domResult.items);
    productLinks.push(...domResult.productLinks);
  }

  return {
    apiLinks,
    discoveredDocuments: extractDocumentLinks($, baseUrl),
    locationPageLinks: extractLocationPageLinks($, baseUrl),
    menuPageLinks: [
      ...extractMenuPageLinks($, baseUrl),
      ...extractCommonMenuPathLinks($, baseUrl),
      ...extractSinglePlatformMenuPageLinks($, baseUrl),
      ...extractPopmenuMenuPageLinks($, restaurant, baseUrl),
      ...extractToastOrderPageLinks($, baseUrl),
      ...extractLaravelCategoryMenuLinks($, baseUrl),
    ],
    officialPageLinks: extractOfficialPageLinks($, baseUrl),
    items: records,
    productLinks: uniqueBy(productLinks, (link) =>
      normalizeUrl(link.url),
    ).slice(0, 150),
  };
}

export function extractJsonMenuFragmentItems(
  text,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  const spotAppsRecords = extractSpotAppsNuxtMenuItems(
    text,
    restaurant,
    url,
    kind,
  );
  const parsed = parseJsonLoose(text);

  if (!parsed || typeof parsed !== "object") {
    return spotAppsRecords;
  }

  const records = [...spotAppsRecords];
  records.push(...extractMenuSifuJsonItems(parsed, restaurant, url, kind));
  records.push(
    ...extractHeartlandInitialDataItems(parsed, restaurant, url, kind),
  );
  records.push(...extractWixRestaurantMenuItems(parsed, restaurant, url, kind));
  records.push(
    ...extractDardenPlatformMenuItems(parsed, restaurant, url, kind),
  );

  if (
    /\/api\/menu\b/i.test(url) &&
    records.some((record) => record.sourceKind === "darden-platform-api")
  ) {
    return uniqueBy(
      records,
      (record) =>
        `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
    );
  }

  if (/_api\/restaurants-menus-item\/v1\/items/i.test(url)) {
    return uniqueBy(
      records,
      (record) =>
        `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
    );
  }

  records.push(
    ...extractRecordsFromObject(
      parsed,
      restaurant,
      url,
      "json-structured",
      kind,
    ),
  );

  if (kind !== sourceTypes.menu) {
    return uniqueBy(
      records,
      (record) =>
        `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
    );
  }

  const stack = [parsed];

  while (stack.length > 0) {
    const value = stack.pop();

    if (
      typeof value === "string" &&
      /class=["'][^"']*single_product/i.test(value)
    ) {
      records.push(
        ...extractHtmlItems(value, restaurant, url, sourceTypes.menu).items,
      );
      continue;
    }

    if (Array.isArray(value)) {
      stack.push(...value);
      continue;
    }

    if (value && typeof value === "object") {
      stack.push(...Object.values(value));
    }
  }

  return uniqueBy(
    records,
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );
}

export function extractIMenuProScriptItems(
  text,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (
    kind === sourceTypes.allergen ||
    !/imenupro\[[\s\S]*?\]\[['"]html['"]\]/i.test(text)
  ) {
    return [];
  }

  const records = [];
  const htmlAssignments =
    /imenupro\[[^\]]+\]\[['"]html['"]\]\s*=\s*'([\s\S]*?)';/g;
  let match;

  while ((match = htmlAssignments.exec(text))) {
    const html = decodeIMenuProHtml(match[1]);
    const $ = cheerio.load(html);

    $(".imp-food-item").each((_index, element) => {
      const $element = $(element);
      const name = cleanText($element.find(".imp-name").first().text());
      const description = cleanText(
        $element.find(".imp-description").first().text(),
      );
      const category =
        cleanText(
          $element
            .parent()
            .prevAll(".imp-heading")
            .first()
            .find(".imp-normal-heading")
            .text(),
        ) ??
        cleanText($element.parent().prevAll(".imp-heading").first().text()) ??
        restaurant.category;

      if (
        !name ||
        !isProbablyMenuItemName(name) ||
        (!description && !hasFoodLanguage(`${name} ${category ?? ""}`))
      ) {
        return;
      }

      const officialAllergens = iMenuProAllergensFromMarkers(
        `${name} ${description ?? ""}`,
      );

      records.push(
        createRecord({
          allergenSourceType:
            officialAllergens.length > 0
              ? allergenSourceTypes.officialAllergenMenu
              : allergenSourceTypes.unavailable,
          allergens: officialAllergens,
          category,
          description,
          evidenceText:
            officialAllergens.length > 0
              ? `${name} ${description ?? ""}`
              : null,
          imageUrl: null,
          ingredientsText: null,
          mayContain: [],
          name,
          sourceKind: "imenupro-menu-script",
          sourceUrl: url,
          variantGroup: category,
        }),
      );
    });
  }

  return uniqueBy(
    records,
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );
}

function decodeIMenuProHtml(value) {
  return decodeHtml(
    decodeJavaScriptString(value)
      .replace(/\\\s+/g, " ")
      .replace(/\\'/g, "'")
      .replace(/\\\//g, "/"),
  );
}

function iMenuProAllergensFromMarkers(value) {
  const normalized = String(value ?? "").toLowerCase();
  const allergens = [];

  if (/(?:^|[,(;\s])sf(?:[),;\s]|$)/i.test(normalized)) {
    allergens.push("shellfish");
  }

  if (/(?:^|[,(;\s])cn(?:[),;\s]|$)/i.test(normalized)) {
    allergens.push("tree-nut");
  }

  return uniqueStrings(allergens);
}

function extractWixRestaurantMenuApiLinksFromAccessTokens(
  text,
  restaurant,
  url,
  queueEntry = null,
) {
  if (
    queueEntry?.role !== "wix-restaurant-menu-access-tokens" ||
    !/_api\/v1\/access-tokens/i.test(url)
  ) {
    return [];
  }

  const parsed = parseJsonLoose(text);
  const app = parsed?.apps?.[wixRestaurantMenusAppDefinitionId];
  const authToken = pickString(app?.instance) ?? pickString(app?.accessToken);

  if (!authToken) {
    return [];
  }

  let origin;

  try {
    origin = new URL(url).origin;
  } catch {
    return [];
  }

  const referer = queueEntry?.referer ?? origin;
  const headers = {
    Accept: "application/json",
    authorization: authToken,
    Referer: referer,
    "x-wix-client-artifact-id": "restaurant-menus-showcase-ooi",
  };

  return [
    {
      fetchOptions: { extraHeaders: headers },
      role: "wix-restaurant-menu-api",
      url: `${origin}/_api/restaurants-menus-item/v1/items`,
    },
  ];
}

function extractWixRestaurantMenuItems(
  parsed,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (
    kind === sourceTypes.allergen ||
    !/_api\/restaurants-menus-item\/v1\/items/i.test(url) ||
    !Array.isArray(parsed?.items)
  ) {
    return [];
  }

  const visibleItems = parsed.items.filter((item) => item?.visible !== false);
  const catalogItems = visibleItems.filter(
    (item) => !isWixRestaurantDemoItem(item),
  );

  const records = [];

  for (const item of catalogItems) {
    const name = pickString(item?.name);
    const description = pickString(item?.description);
    const imageUrl = pickImage(item?.image?.url) ?? pickImage(item?.imageUrl);

    if (
      !name ||
      !isProbablyMenuItemName(name) ||
      (!description &&
        !imageUrl &&
        !hasFoodLanguage(`${name} ${restaurant.category ?? ""}`))
    ) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.unavailable,
        allergens: [],
        category: restaurant.category,
        description,
        imageUrl,
        ingredientsText: null,
        mayContain: [],
        name,
        sourceKind: "wix-restaurant-menus-api",
        sourceUrl: url,
      }),
    );
  }

  return uniqueBy(
    records,
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );
}

function isLikelyWixRestaurantDemoCatalog(items) {
  const names = new Set(
    items
      .map((item) => normalizeMenuName(pickString(item?.name) ?? ""))
      .filter(Boolean),
  );
  const demoHits = wixRestaurantDemoItemNames.filter((name) =>
    names.has(name),
  ).length;

  return demoHits >= 5 || (items.length > 0 && demoHits / items.length >= 0.4);
}

function isWixRestaurantDemoItem(item) {
  return wixRestaurantDemoItemNameSet.has(
    normalizeMenuName(pickString(item?.name) ?? ""),
  );
}

function dropWixRestaurantDemoCatalogItems(items, sourceResults) {
  const touchedWixRestaurantMenus = sourceResults.some((entry) =>
    /(?:_api\/restaurants-menus-|restaurant-menus-showcase|_api\/v1\/access-tokens)/i.test(
      `${entry.url ?? ""} ${entry.finalUrl ?? ""}`,
    ),
  );

  if (!touchedWixRestaurantMenus || !isLikelyWixRestaurantDemoCatalog(items)) {
    return items;
  }

  const filteredItems = items.filter((item) => !isWixRestaurantDemoItem(item));

  return filteredItems.length >= 4 ? filteredItems : [];
}

function extractMenuSifuJsonItems(
  parsed,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (kind === sourceTypes.allergen || !Array.isArray(parsed?.menuCategories)) {
    return [];
  }

  const records = [];

  for (const category of parsed.menuCategories) {
    const categoryName =
      pickLocalizedString(category?.name) ??
      pickLocalizedString(category?.shortName) ??
      restaurant.category;

    for (const item of category?.saleItems ?? []) {
      if (!item || typeof item !== "object" || item.hiddenItem === true) {
        continue;
      }

      const name =
        pickLocalizedString(item.name) ??
        pickLocalizedString(item.shortName) ??
        pickString(item.itemName);
      const description = pickLocalizedString(item.description) ?? null;
      const imageUrl = pickImage(item.pics) ?? pickImage(item.smallPics);

      if (
        !name ||
        !isProbablyMenuItemName(name) ||
        (!description && !imageUrl && !hasFoodLanguage(name))
      ) {
        continue;
      }

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.unavailable,
          allergens: [],
          category: categoryName,
          description,
          imageUrl,
          ingredientsText: null,
          mayContain: [],
          name,
          sourceKind: "menusifu-api",
          sourceUrl: url,
          variantGroup: categoryName,
        }),
      );
    }
  }

  return uniqueBy(
    records,
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );
}

function extractHeartlandInitialDataItems(
  parsed,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (
    kind === sourceTypes.allergen ||
    !/online\.hrpos\.heartland\.us\/initial_data/i.test(url)
  ) {
    return [];
  }

  const setup =
    parsed?.payload?.setup?.setup ??
    parsed?.setup?.setup ??
    parsed?.setup ??
    parsed?.payload?.setup;

  if (!setup || typeof setup !== "object") {
    return [];
  }

  const groups = objectValues(setup.setupGroups);
  const sectionsById = objectMapById(setup.setupSections, "sectionId");
  const itemsById = objectMapById(setup.setupMenuItems, "itemId");
  const sectionItems = setup.setupSectionItems ?? {};
  const groupSections = setup.setupGroupSections ?? {};
  const menuGroups = groups.filter((group) =>
    /^menu$/i.test(pickString(group?.defaultName) ?? ""),
  );
  const groupsToRead =
    menuGroups.length > 0
      ? menuGroups
      : groups.filter(
          (group) =>
            !/catering|school|bar|drinks?|beverages?|cocktails?|wine|beer/i.test(
              pickString(group?.defaultName) ?? "",
            ),
        );
  const records = [];

  for (const group of groupsToRead) {
    const groupId = stringifyId(group?.groupId ?? group?.id);
    const sectionIds = asArray(groupSections[groupId]);

    for (const sectionId of sectionIds) {
      const section = sectionsById.get(String(sectionId));
      const sectionName =
        pickString(section?.defaultName) ??
        pickString(section?.name) ??
        restaurant.category;

      if (isProbablyNonFoodHeartlandSection(sectionName)) {
        continue;
      }

      for (const itemId of asArray(sectionItems[String(sectionId)])) {
        const item = itemsById.get(String(itemId));

        if (
          !item ||
          item.isAlcohol === true ||
          item.giftCard === true ||
          item.nonRevenue === true
        ) {
          continue;
        }

        const name =
          pickString(item.defaultName) ??
          pickString(item.defaultShortName) ??
          pickString(item.name);
        const description =
          pickString(item.defaultItemDescription) ??
          pickString(item.description);
        const imageUrl = pickImage(item.imageUrl) ?? pickImage(item.thumbUrl);
        const itemCategory = pickString(item.categoryName);

        if (
          !name ||
          !isProbablyMenuItemName(name) ||
          isProbablyNonFoodHeartlandSection(itemCategory) ||
          (!description &&
            !imageUrl &&
            !hasFoodLanguage(`${name} ${sectionName}`))
        ) {
          continue;
        }

        records.push(
          createRecord({
            allergenSourceType: allergenSourceTypes.unavailable,
            allergens: [],
            category: sectionName,
            description,
            imageUrl,
            ingredientsText: null,
            mayContain: [],
            name,
            sourceKind: "heartland-initial-data",
            sourceUrl: url,
            variantGroup: pickString(group?.defaultName) ?? sectionName,
          }),
        );
      }
    }
  }

  return uniqueBy(
    records,
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );
}

function isProbablyNonFoodHeartlandSection(text) {
  return /^(?:beer|wine|cocktails?|drinks?|beverages?|bar|spirits?|liquor|merch|gift cards?)$/i.test(
    cleanText(text) ?? "",
  );
}

function extractDardenPlatformMenuItems(
  parsed,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (kind === sourceTypes.allergen || !/\/api\/menu\b/i.test(url)) {
    return [];
  }

  const rootCategories = asArray(parsed?.categories);

  if (rootCategories.length === 0) {
    return [];
  }

  const records = [];

  for (const rootCategory of rootCategories) {
    for (const section of dardenPlatformSections(rootCategory)) {
      const sectionName =
        pickString(section?.displayName) ??
        pickString(section?.name) ??
        pickString(rootCategory?.displayName) ??
        restaurant.category;

      if (isProbablyNonFoodDardenPlatformSection(sectionName)) {
        continue;
      }

      const sectionDescription =
        pickString(section?.description) ??
        pickString(rootCategory?.description);

      for (const product of asArray(section?.products)) {
        if (!product || typeof product !== "object") {
          continue;
        }

        const name =
          pickString(product.displayName) ??
          pickString(product.name) ??
          pickString(product.title);
        const description =
          cleanText(product.longDescription ?? product.description) ??
          sectionDescription;
        const imageUrl = absolutizeUrl(
          pickImage(product.media) ??
            pickImage(product.image) ??
            pickImage(product.mobileAppLargeImage) ??
            pickImage(product.largeImageUrl) ??
            pickImage(product.smallImageUrl),
          url,
        );

        if (
          !name ||
          !isProbablyMenuItemName(name) ||
          product?.configs?.isBeverageItem === true ||
          isProbablyNonFoodDardenPlatformSection(
            pickString(product?.categoryName),
          ) ||
          (!description &&
            !imageUrl &&
            !hasFoodLanguage(`${name} ${sectionName}`))
        ) {
          continue;
        }

        records.push(
          createRecord({
            allergenSourceType: allergenSourceTypes.unavailable,
            allergens: [],
            category: sectionName,
            description,
            imageUrl,
            ingredientsText: null,
            mayContain: [],
            name,
            sourceKind: "darden-platform-api",
            sourceUrl: url,
            variantGroup: sectionName,
          }),
        );
      }
    }
  }

  return uniqueBy(
    records,
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );
}

function dardenPlatformSections(rootCategory) {
  const sections = [
    ...asArray(rootCategory?.subCategories),
    ...asArray(rootCategory?.menucategories),
  ];

  if (asArray(rootCategory?.products).length > 0) {
    sections.push(rootCategory);
  }

  return sections;
}

function isProbablyNonFoodDardenPlatformSection(text) {
  return /^(?:from the bar|boozy shakes?|zero proof|beer(?:\s+(?:on tap|by the bottle))?|wines?(?:\s+by the glass)?|red|white\s*\/\s*ros[ée]|sparkling|cocktails?|drinks?|beverages?|bar|spirits?|liquor)$/i.test(
    cleanText(text) ?? "",
  );
}

function objectValues(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === "object") {
    return Object.values(value);
  }

  return [];
}

function objectMapById(value, idKey) {
  const map = new Map();

  for (const entry of objectValues(value)) {
    const id = stringifyId(entry?.[idKey] ?? entry?.id);

    if (id) {
      map.set(String(id), entry);
    }
  }

  return map;
}

function stringifyId(value) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function extractSpotAppsNuxtMenuItems(
  text,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (
    kind === sourceTypes.allergen ||
    !/tmt\.spotapps\.co|window\.__NUXT__|food_menu_items/i.test(
      `${url} ${text}`,
    )
  ) {
    return [];
  }

  const parsed = parseSpotAppsNuxtPayload(text);
  const menus =
    parsed?.data?.flatMap((entry) =>
      Array.isArray(entry?.menus) ? entry.menus : [],
    ) ?? [];

  if (menus.length === 0) {
    return [];
  }

  const records = [];

  for (const menu of menus) {
    const menuName = pickString(menu?.name);
    const menuType = pickString(menu?.menu_type);

    if (menuType && !/^food$/i.test(menuType)) {
      continue;
    }

    for (const section of menu?.food_menu_sections ?? []) {
      const sectionName =
        pickString(section?.name) ?? menuName ?? restaurant.category;
      const sectionDescription = pickString(section?.description);

      for (const item of section?.food_menu_items ?? []) {
        if (!item || typeof item !== "object" || item.in_stock === false) {
          continue;
        }

        const name = pickString(item.name);
        const description = pickBestDescription(
          item.description,
          sectionDescription,
        );
        const imageUrl = pickImage(item.images);

        if (
          !name ||
          !isProbablyMenuItemName(name) ||
          (!description && !imageUrl && !hasFoodLanguage(name))
        ) {
          continue;
        }

        records.push(
          createRecord({
            allergenSourceType: allergenSourceTypes.unavailable,
            allergens: [],
            category: sectionName,
            description,
            imageUrl,
            ingredientsText: null,
            mayContain: [],
            name,
            sourceKind: "spotapps-nuxt-menu",
            sourceUrl: url,
            variantGroup: menuName ?? sectionName,
          }),
        );
      }
    }
  }

  return uniqueBy(
    records,
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );
}

function parseSpotAppsNuxtPayload(text) {
  const source = String(text ?? "");
  const markerIndex = source.indexOf("window.__NUXT__=");

  if (markerIndex < 0) {
    return null;
  }

  const expressionStart = markerIndex + "window.__NUXT__=".length;
  const scriptEnd = source.indexOf("</script>", expressionStart);
  const expressionEnd = scriptEnd >= 0 ? scriptEnd : source.length;
  const expression = source
    .slice(expressionStart, expressionEnd)
    .replace(/;\s*$/, "")
    .trim();

  if (!expression.startsWith("(") || !expression.includes("food_menu_items")) {
    return null;
  }

  try {
    return vm.runInNewContext(
      `(${expression})`,
      { Array, Boolean, Date, Math, Number, Object, RegExp, String },
      { timeout: 1000 },
    );
  } catch {
    return null;
  }
}

function extractImageFilenameMenuItems(
  $,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (kind === sourceTypes.allergen || !isMenuishPage($, url)) {
    return [];
  }

  const category =
    cleanText($("meta[property='og:title']").first().attr("content")) ??
    cleanText($("h1").first().text()) ??
    cleanText($("title").first().text()) ??
    restaurant.category;
  const urls = [];

  $("meta[property='og:image'], meta[name='twitter:image']").each(
    (_index, element) => {
      const href = absolutizeUrl($(element).attr("content"), url);

      if (href) {
        urls.push(href);
      }
    },
  );

  $("img[src], source[srcset]").each((_index, element) => {
    const src =
      $(element).attr("src") ?? firstSrcsetUrl($(element).attr("srcset"));
    const href = absolutizeUrl(src, url);

    if (href) {
      urls.push(href);
    }
  });

  const candidates = uniqueBy(
    urls
      .map((imageUrl) => ({
        imageUrl,
        name: menuNameFromImageUrl(imageUrl),
      }))
      .filter(
        (candidate) => candidate.name && isProbablyMenuItemName(candidate.name),
      )
      .filter((candidate) => hasFoodLanguage(candidate.name)),
    (candidate) => similarityKey(candidate.name),
  );

  if (candidates.length < 4) {
    return [];
  }

  return candidates.map((candidate) =>
    createRecord({
      allergenSourceType: allergenSourceTypes.unavailable,
      allergens: [],
      category,
      description: null,
      imageUrl: candidate.imageUrl,
      mayContain: [],
      name: candidate.name,
      sourceKind: "html-image-menu",
      sourceUrl: url,
    }),
  );
}

function isMenuishPage($, url) {
  const text = `${url} ${$("title").first().text()} ${$("h1").first().text()} ${$("meta[property='og:title']").first().attr("content") ?? ""}`;

  return /\b(?:menu|food|breakfast|brunch|lunch|dinner|dessert|pork|beef|chicken|seafood|noodle|rice|soup|vegetable|vegetables)\b/i.test(
    text,
  );
}

function firstSrcsetUrl(srcset) {
  return (
    cleanText(srcset)
      ?.split(/\s*,\s*/)[0]
      ?.split(/\s+/)[0] ?? null
  );
}

function menuNameFromImageUrl(imageUrl) {
  let pathname;

  try {
    pathname = decodeURIComponent(new URL(imageUrl).pathname);
  } catch {
    return null;
  }

  const filename = pathname
    .split("/")
    .pop()
    ?.replace(/\.(?:jpe?g|png|webp|gif)(?:$|[?#].*)/i, "")
    .replace(
      /(?:_orig|_original|_large|_medium|_small|_thumb|_thumbnail)$/i,
      "",
    )
    .replace(/(?:-\d+x\d+|_\d+x\d+)$/i, "")
    .replace(/^[a-z]?\d{1,4}[-_\s]+/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (
    !filename ||
    filename.length < 5 ||
    /^(?:background|banner|brand|button|facebook|favicon|footer|header|hero|icon|instagram|logo|map|placeholder|social|sprite|twitter|youtube)\b/i.test(
      filename,
    ) ||
    /\b(?:blog|filled\d*|icon|recipe|stock|wallpaper)\b/i.test(filename)
  ) {
    return null;
  }

  return titleCaseMenuName(filename);
}

function titleCaseMenuName(value) {
  return cleanText(value)
    ?.split(/\s+/)
    .map((word) => {
      if (/^(?:and|or|of|the|with|in|a|an)$/i.test(word)) {
        return word.toLowerCase();
      }

      if (/^[A-Z]{2,}$/.test(word)) {
        return word;
      }

      return `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`;
    })
    .join(" ");
}

function extractPapaJohnsNutritionItems($, restaurant, url) {
  const records = [];

  $("[data-ingredient] > section").each((_index, section) => {
    const $section = $(section);
    const name = cleanText(
      $section.find("header h5.h3, header h5, header h3").first().text(),
    );

    if (!name || !isProbablyMenuItemName(name)) {
      return;
    }

    const servingTable = $section
      .find("table[aria-label*='Serving Size' i], table")
      .filter((_tableIndex, table) => /Serving Size/i.test($(table).text()))
      .first();
    const nutritionTable = $section
      .find("table[aria-label*='Nutritional Facts' i], table")
      .filter((_tableIndex, table) =>
        /Total Calories|Total Fat|Sodium/i.test($(table).text()),
      )
      .last();
    const sizes = tableColumnHeaders($, nutritionTable);

    if (sizes.length === 0) {
      return;
    }

    const servingSizes = papaJohnsServingSizes($, servingTable, sizes.length);
    const nutritionBySize = papaJohnsNutritionBySize(
      $,
      nutritionTable,
      sizes.length,
    );

    for (let index = 0; index < sizes.length; index += 1) {
      const nutritionFacts = normalizeNutritionFacts({
        "Serving Size": servingSizes[index],
        ...nutritionBySize[index],
      });

      if (!nutritionFacts || Object.keys(nutritionFacts).length === 0) {
        continue;
      }

      const size = cleanText(sizes[index]);
      const names = uniqueStrings(
        [name, size && sizes.length > 1 ? `${name} ${size}` : null].filter(
          Boolean,
        ),
      );

      for (const recordName of names) {
        records.push(
          createRecord({
            allergenSourceType: allergenSourceTypes.unavailable,
            allergens: [],
            category: restaurant.category,
            description: "Official Papa Johns nutritional details.",
            imageUrl: null,
            mayContain: [],
            name: recordName,
            nutritionFacts,
            sourceKind: "html-nutrition",
            sourceUrl: url,
          }),
        );
      }
    }
  });

  return records;
}

function extractPapaJohnsAllergenGuideItems($, restaurant, url) {
  const records = [];

  $("table").each((_tableIndex, table) => {
    const $table = $(table);
    const allergenColumns = $table
      .find("thead th")
      .toArray()
      .map((header, index) => ({
        allergens: normalizeProviderAllergens([
          $(header).attr("id"),
          cleanText($(header).text()) ?? "",
        ]),
        index,
      }));

    if (
      allergenColumns.filter(
        (column) => column.index > 0 && column.allergens.length > 0,
      ).length < 6
    ) {
      return;
    }

    let currentCategory = restaurant.category;

    $table.find("tbody tr").each((_rowIndex, row) => {
      const $row = $(row);
      const $cells = $row.find("th,td");
      const firstCellText = cleanText($cells.first().text());
      const categoryText =
        cleanText($cells.first().find("h2,h3,h4").first().text()) ??
        firstCellText;

      if ($cells.first().find("h2,h3,h4").length > 0 && categoryText) {
        currentCategory = categoryText;
        return;
      }

      const name = firstCellText;

      if (!name || !isProbablyMenuItemName(name)) {
        return;
      }

      const allergens = [];

      $cells.each((cellIndex, cell) => {
        const column = allergenColumns[cellIndex];

        if (!column || column.index === 0 || column.allergens.length === 0) {
          return;
        }

        if (papaJohnsAllergenCellIsPositive($, cell)) {
          allergens.push(...column.allergens);
        }
      });

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens: uniqueStrings(allergens),
          category: currentCategory,
          description: "Official Papa Johns allergen guide.",
          imageUrl: null,
          mayContain: [],
          name,
          sourceKind: "html-allergen-matrix",
          sourceUrl: url,
          variantGroup: currentCategory,
        }),
      );
    });
  });

  return uniqueBy(
    records,
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );
}

function papaJohnsAllergenCellIsPositive($, cell) {
  const $cell = $(cell);
  const markerText = [$cell.text(), $cell.attr("aria-label")]
    .filter(Boolean)
    .join(" ");

  return /✔|✓|contains\b/i.test(markerText);
}

function extractInNOutNutritionHtmlItems($, restaurant, url) {
  const records = [];

  $(".nutrition-header").each((_index, header) => {
    const $header = $(header);
    const $panel = $header.next(".js-accordion__panel");
    const rawHeaderName = cleanText(
      $header.clone().children().remove().end().text(),
    );
    const name =
      cleanText($panel.find("header h2").first().text()) ?? rawHeaderName;
    const nutritionFacts = nutritionFactsFromDefinitionList(
      $,
      $panel.children("dl").first(),
    );
    const ingredientsText = cleanText(
      $panel
        .find(".ingredients p")
        .map((_paragraphIndex, paragraph) => $(paragraph).text())
        .get()
        .join(" "),
    );

    if (!name || !nutritionFacts || Object.keys(nutritionFacts).length === 0) {
      return;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens: findDeclaredAllergensOnly(ingredientsText ?? ""),
        category: inNOutCategoryForItem(name),
        description: "Official In-N-Out nutrition information page.",
        imageUrl: absolutizeUrl(
          $panel.find("header img").first().attr("src"),
          url,
        ),
        ingredientsText,
        mayContain: [],
        name,
        nutritionFacts,
        sourceKind: "html-nutrition",
        sourceUrl: url,
      }),
    );
  });

  return uniqueBy(records, (record) => record.name);
}

function nutritionFactsFromDefinitionList($, $list) {
  const facts = {};

  $list.find("dt").each((_index, term) => {
    const label = normalizeNutritionHeader($(term).text());
    const value = cleanText($(term).next("dd").text());

    if (label && value) {
      facts[label] = parseNutritionNumber(value) ?? value;
    }
  });

  return normalizeNutritionFacts(facts);
}

function inNOutCategoryForItem(name) {
  if (/shake/i.test(name)) {
    return "Shakes";
  }

  if (/fries/i.test(name)) {
    return "Fries";
  }

  if (/coffee|cocoa|milk|lemonade|tea|drink|beverage|soda/i.test(name)) {
    return "Beverages";
  }

  return "Burgers";
}

function extractNothingBundtCakesNutritionItems($, restaurant, url) {
  const records = [];

  $("table.dataframe").each((_tableIndex, table) => {
    const $table = $(table);
    const headers = $table
      .find("thead th")
      .map(
        (_index, header) =>
          normalizeNutritionHeader($(header).text()) ??
          cleanText($(header).text()),
      )
      .get();
    const category =
      cleanText(
        $table
          .closest(".table-container")
          .prevAll(".table-cat-sto")
          .first()
          .text(),
      ) ?? "Cake Flavors";

    $table.find("tbody tr").each((_rowIndex, row) => {
      const cells = $(row)
        .find("td,th")
        .map((_cellIndex, cell) => cleanText($(cell).text()))
        .get();
      const name = cells[0];

      if (
        !name ||
        !isProbablyMenuItemName(name) ||
        /not available/i.test(cells.join(" "))
      ) {
        return;
      }

      const facts = {};

      cells.slice(1).forEach((value, index) => {
        const header = headers[index + 1];

        if (header && value) {
          facts[header] = value.replace(/^</, "0.");
        }
      });

      const nutritionFacts = normalizeNutritionFacts(facts);

      if (!nutritionFacts || Object.keys(nutritionFacts).length === 0) {
        return;
      }

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.unavailable,
          allergens: [],
          category,
          description: "Official Nothing Bundt Cakes nutritional guide.",
          imageUrl: null,
          mayContain: [],
          name,
          nutritionFacts,
          sourceKind: "html-nutrition",
          sourceUrl: url,
          variantGroup: category,
        }),
      );
    });
  });

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function extractFirstWatchNutritionHtmlItems($, restaurant, url) {
  const records = [];

  $(".nutrition-main-table-row").each((_sectionIndex, section) => {
    const $section = $(section);
    const category =
      cleanText($section.find(".nutrition-content-headline").first().text()) ??
      restaurant.category;
    const headers = $section
      .find(".nutrition-details-table thead th")
      .map(
        (_index, header) =>
          normalizeNutritionHeader($(header).text()) ??
          cleanText($(header).text()),
      )
      .get()
      .filter((header) => header && !/^menu item$/i.test(header));
    const detailRows = $section
      .find(".nutrition-details-table tbody tr")
      .toArray();

    for (let index = 0; index < detailRows.length; index += 2) {
      const nutritionCells = $(detailRows[index])
        .find("td,th")
        .map((_cellIndex, cell) => cleanText($(cell).text()))
        .get();
      const allergenText = cleanText($(detailRows[index + 1]).text()) ?? "";
      const name = nutritionCells[0];

      if (!name || !isProbablyMenuItemName(name)) {
        continue;
      }

      const facts = {};

      nutritionCells.slice(1).forEach((value, cellIndex) => {
        const header = headers[cellIndex];

        if (header && value) {
          facts[header] = value;
        }
      });

      const nutritionFacts = normalizeNutritionFacts(facts);

      if (!nutritionFacts || Object.keys(nutritionFacts).length === 0) {
        continue;
      }

      const declaredAllergenText = allergenText.replace(
        /^Allergens for .*?:/i,
        "",
      );
      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens: normalizeProviderAllergens(
            declaredAllergenText.split(/\s*,\s*/),
          ),
          category,
          description:
            "Official First Watch nutrition and allergen information page.",
          imageUrl: null,
          mayContain: [],
          name,
          nutritionFacts,
          sourceKind: "html-nutrition",
          sourceUrl: url,
          variantGroup: category,
        }),
      );
    }
  });

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function tableColumnHeaders($, table) {
  const headers = $(table)
    .find("thead th")
    .toArray()
    .slice(1)
    .map((cell) => cleanText($(cell).text()))
    .filter(Boolean);

  if (headers.length > 0) {
    return headers;
  }

  const firstDataCellCount = $(table)
    .find("tbody tr")
    .first()
    .find("td").length;
  return Array.from({ length: firstDataCellCount }, (_value, index) =>
    firstDataCellCount === 1 ? "Default" : `Option ${index + 1}`,
  );
}

function papaJohnsServingSizes($, table, sizeCount) {
  const values = Array.from({ length: sizeCount }, () => null);

  $(table)
    .find("tbody tr")
    .each((_index, row) => {
      const label = cleanText($(row).find("th").first().text());

      if (!/Serving Size/i.test(label ?? "")) {
        return;
      }

      $(row)
        .find("td")
        .each((cellIndex, cell) => {
          values[cellIndex] = cleanText($(cell).text());
        });
    });

  return values;
}

function papaJohnsNutritionBySize($, table, sizeCount) {
  const values = Array.from({ length: sizeCount }, () => ({}));
  const labelMap = new Map([
    ["Total Calories", "Calories"],
    ["Calories from Fat", "Calories from Fat"],
    ["Total Fat", "Total Fat"],
    ["Saturated Fat", "Saturated Fat"],
    ["Trans Fat", "Trans Fat"],
    ["Cholesterol", "Cholesterol"],
    ["Sodium", "Sodium"],
    ["Total Carbohydrate", "Total Carbohydrates"],
    ["Dietary Fiber", "Dietary Fiber"],
    ["Sugars", "Sugars"],
    ["Protein", "Protein"],
  ]);

  $(table)
    .find("tbody tr")
    .each((_index, row) => {
      const label = cleanText($(row).find("th").first().text());
      const normalizedLabel = labelMap.get(titleCase(label ?? ""));

      if (!normalizedLabel) {
        return;
      }

      $(row)
        .find("td")
        .each((cellIndex, cell) => {
          if (cellIndex < sizeCount) {
            values[cellIndex][normalizedLabel] = cleanText($(cell).text());
          }
        });
    });

  return values;
}

function extractPfChangsAllergenItems($, restaurant, url) {
  const records = [];
  const tableCategories = [
    null,
    "Appetizers",
    "Dim Sum",
    "Sushi",
    "Shareable Sides",
    "Salads & Soup",
    "Main Entrees",
    "Noodles & Rice",
    "Sides",
    "Weekday Lunch",
    "Served With Choice Of",
    "Add A Side",
    "Gluten-Free Lunch",
    "Gluten-Free Lunch Sides",
    "Add On",
    "Kids Menu",
    "Kids Desserts",
    "Gluten-Free Kids Menu",
    "Gluten-Free Kids Desserts",
    "Desserts",
    "Gluten-Free Appetizers",
    "Gluten-Free Soups",
    "Gluten-Free Main Entrees",
    "Gluten-Free Noodles & Rice",
    "Gluten-Free Sides",
    "Gluten-Free Dessert",
  ];
  const rowSectionHeaders = new Map([
    ["BEEF", "Beef"],
    ["CHICKEN", "Chicken"],
    ["SEAFOOD", "Seafood"],
    ["VEGETARIAN", "Vegetarian"],
    ["DELUXE ENTREES", "Deluxe Entrees"],
    ["CHOOSE YOUR PROTEIN", "Choose Your Protein"],
    ["SAUCE FLIGHT", "Sauce Flight"],
  ]);

  $("table").each((_tableIndex, table) => {
    let currentCategory =
      tableCategories[_tableIndex] ??
      cleanText($(table).prevAll("h2,h3,h4").first().text()) ??
      cleanText($(table).parent().prevAll("h2,h3,h4").first().text()) ??
      restaurant.category;

    const rows = $(table)
      .find("tr")
      .toArray()
      .map((row) =>
        $(row)
          .find("th,td")
          .toArray()
          .map((cell) => cleanText($(cell).text()) ?? ""),
      )
      .filter((cells) => cells.some(Boolean));
    const header = rows[0] ?? [];
    const allergenColumns = header.map((cell, index) => ({
      allergens: normalizeProviderAllergens([cell]),
      index,
    }));

    if (
      allergenColumns.slice(1).filter((column) => column.allergens.length > 0)
        .length < 6
    ) {
      return;
    }

    for (const cells of rows.slice(1)) {
      const name = cleanText(cells[0]);

      if (!name || !isProbablyMenuItemName(name)) {
        continue;
      }

      const rowHeaderCategory = rowSectionHeaders.get(name.toUpperCase());
      if (rowHeaderCategory) {
        currentCategory = rowHeaderCategory;
        continue;
      }

      const allergens = [];
      const evidenceCells = [];

      for (const column of allergenColumns) {
        if (column.index === 0 || column.allergens.length === 0) {
          continue;
        }

        const cellValue = cleanText(cells[column.index] ?? "");
        if (/x|yes|contains|✔|✓|●/i.test(cellValue ?? "")) {
          allergens.push(...column.allergens);
          evidenceCells.push(`${header[column.index]} ${cellValue}`);
        }
      }

      if (allergens.length === 0 && /^[A-Z '&-]+$/.test(name)) {
        continue;
      }

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens,
          category: currentCategory,
          description: "Official P.F. Chang's allergen matrix.",
          evidenceText:
            evidenceCells.length > 0
              ? `Official P.F. Chang's allergen matrix row: ${name}: ${evidenceCells.join("; ")}.`
              : `Official P.F. Chang's allergen matrix row: ${name}: no supported app allergens marked.`,
          imageUrl: null,
          mayContain: [],
          name,
          sourceKind: "html-allergen-matrix",
          sourceUrl: url,
          variantGroup: currentCategory,
        }),
      );
    }
  });

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function extractNothingBundtCakesIngredientItems($, restaurant, url) {
  const text = cleanText($("body").text()) ?? "";
  const records = [];
  const pattern =
    /([A-Z][A-Za-z0-9 '&®™.-]{2,80})›\s*INGREDIENTS:\s*([\s\S]*?)(?=(?:[A-Z][A-Za-z0-9 '&®™.-]{2,80})›\s*INGREDIENTS:|$)/g;
  let match;

  while ((match = pattern.exec(text))) {
    const name = cleanText(match[1].split(/\.\s+/).pop());
    const ingredientsText = cleanText(`INGREDIENTS: ${match[2]}`);

    if (!name || !ingredientsText || !isProbablyMenuItemName(name)) {
      continue;
    }

    const containsText =
      ingredientsText.match(/\bCONTAINS:\s*([^.]*)/i)?.[1] ?? "";
    const mayContainText =
      ingredientsText.match(/\bMAY CONTAIN(?: TRACES OF)?:\s*([^.]*)/i)?.[1] ??
      "";

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens: uniqueStrings([
          ...findAllergensInText(containsText),
          ...findDeclaredAllergensOnly(containsText),
        ]),
        category: "Cake Flavors",
        description: "Official Nothing Bundt Cakes ingredients list.",
        imageUrl: null,
        ingredientsText,
        mayContain: uniqueStrings([
          ...findMayContainAllergens(mayContainText),
          ...findAllergensInText(mayContainText),
        ]),
        name,
        sourceKind: "html-ingredients",
        sourceUrl: url,
        variantGroup: "Cake Flavors",
      }),
    );
  }

  return uniqueBy(records, (record) => record.name);
}

function extractJenisIngredientItems($, restaurant, url) {
  const records = [];

  $(".faq-accordion__section, faq-accordion").each((_, element) => {
    const $element = $(element);
    const name = cleanText(
      $element.find(".faq-accordion__title").first().text(),
    );
    const ingredientsText = cleanText(
      $element
        .find(".faq-accordion__text")
        .first()
        .text()
        .replace(/\bIngredients Table\b/gi, ""),
    );

    if (!name || !ingredientsText || !isProbablyMenuItemName(name)) {
      return;
    }

    if (!/\bContains:\s*/i.test(ingredientsText)) {
      return;
    }

    const containsText =
      ingredientsText.match(
        /\bContains:\s*([\s\S]*?)(?=\b(?:GLUTEN FREE|VEGAN|DAIRY FREE)\b|$)/i,
      )?.[1] ?? "";
    const allergens = /\bnone\b/i.test(containsText)
      ? []
      : uniqueStrings([
          ...findAllergensInText(containsText),
          ...findDeclaredAllergensOnly(containsText),
        ]);

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: "Ice Cream",
        description: "Official Jeni's ingredients list.",
        imageUrl: null,
        ingredientsText,
        mayContain: findMayContainAllergens(ingredientsText),
        name,
        sourceKind: "html-ingredients",
        sourceUrl: url,
        variantGroup: "Ice Cream",
      }),
    );
  });

  return uniqueBy(records, (record) => record.name);
}

function extractFreddysAllergenItems($, restaurant, url) {
  const allergenLabels = [
    ["Peanuts", ["peanut"]],
    ["Tree Nuts", ["tree-nut"]],
    ["Egg", ["egg"]],
    ["Milk", ["milk"]],
    ["Wheat/Gluten", ["wheat", "gluten"]],
    ["Soybean", ["soy"]],
    ["Fish", ["fish"]],
    ["Shellfish", ["shellfish"]],
    ["Sesame", ["sesame"]],
  ];
  const records = [];
  const nutritionByName = new Map();

  $("article.node--type-nutrition-info").each((_articleIndex, article) => {
    const category =
      cleanText($(article).find("h2 span").first().text()) ??
      restaurant.category;

    $(article)
      .find(".paragraph--type--nutrition-items")
      .each((_itemIndex, item) => {
        const name = cleanText(
          $(item).find(".field-item__field-menu-item").first().text(),
        );

        if (!name || !isProbablyMenuItemName(name)) {
          return;
        }

        const facts = {
          Calories: freddysNutritionValue($, item, "calories"),
          "Calories from Fat": freddysNutritionValue(
            $,
            item,
            "calories-from-fat",
          ),
          Cholesterol: freddysNutritionValue($, item, "cholesterol"),
          Sodium: freddysNutritionValue($, item, "sodium"),
          "Trans Fat": freddysNutritionValue($, item, "trans-fat"),
          "Saturated Fat": freddysNutritionValue($, item, "saturated-fat"),
          "Total Fat": freddysNutritionValue($, item, "total-fat"),
          "Total Carbohydrates": freddysNutritionValue($, item, "carbs"),
          "Dietary Fiber": freddysNutritionValue($, item, "fiber"),
          Sugars: freddysNutritionValue($, item, "sugars"),
          Protein: freddysNutritionValue($, item, "protein"),
        };

        nutritionByName.set(
          normalizeMenuName(name),
          normalizeNutritionFacts(facts),
        );
      });

    $(article)
      .find(".paragraph--type--allergen-item")
      .each((_itemIndex, item) => {
        const rowText = cleanText($(item).text()) ?? "";
        const firstAllergenIndex = rowText.search(/\bPeanuts\b/);
        const name = cleanText(
          firstAllergenIndex > 0 ? rowText.slice(0, firstAllergenIndex) : "",
        );

        if (!name || !isProbablyMenuItemName(name)) {
          return;
        }

        const allergens = [];
        const mayContain = [];

        for (let index = 0; index < allergenLabels.length; index += 1) {
          const [label, mapped] = allergenLabels[index];
          const nextLabel = allergenLabels[index + 1]?.[0];
          const start = rowText.indexOf(label);

          if (start < 0) {
            continue;
          }

          const end = nextLabel
            ? rowText.indexOf(nextLabel, start + label.length)
            : rowText.length;
          const status = rowText.slice(
            start + label.length,
            end > start ? end : rowText.length,
          );

          if (/Allergen Exists/i.test(status)) {
            allergens.push(...mapped);
          } else if (/Disclaimer|\*/i.test(status)) {
            mayContain.push(...mapped);
          }
        }

        records.push(
          createRecord({
            allergenSourceType: allergenSourceTypes.officialAllergenMenu,
            allergens,
            category,
            description:
              "Official Freddy's nutritional and allergen info table.",
            imageUrl: null,
            mayContain,
            name,
            nutritionFacts: nutritionByName.get(normalizeMenuName(name)),
            sourceKind: "html-allergen-matrix",
            sourceUrl: url,
            variantGroup: category,
          }),
        );
      });
  });

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function freddysNutritionValue($, item, field) {
  const text = cleanText(
    $(item).find(`.field-item__field-${field}`).first().text(),
  );
  return parseNutritionNumber(text) ?? text ?? null;
}

function extractDairyQueenAllergenItems($, restaurant, url) {
  const records = [];

  $("table").each((_tableIndex, table) => {
    const headers = $(table)
      .find("tr")
      .first()
      .find("th,td")
      .map((_index, cell) => cleanText($(cell).text()) ?? "")
      .get();
    const itemIndex = headers.findIndex((header) =>
      /^menu item$/i.test(header),
    );
    const allergenIndex = headers.findIndex((header) =>
      /^allergens$/i.test(header),
    );

    if (itemIndex < 0 || allergenIndex < 0) {
      return;
    }

    const category =
      cleanText($(table).prevAll("h3").first().text())?.replace(
        /\s*\(See table footer for legend\)$/i,
        "",
      ) ?? restaurant.category;

    $(table)
      .find("tr")
      .slice(1)
      .each((_rowIndex, row) => {
        const cells = $(row)
          .find("th,td")
          .map((_cellIndex, cell) => cleanText($(cell).text()) ?? "")
          .get();
        const name = cells[itemIndex];

        if (!name || !isProbablyMenuItemName(name)) {
          return;
        }

        const { allergens, mayContain } = dairyQueenAllergenCodes(
          cells[allergenIndex] ?? "",
        );

        records.push(
          createRecord({
            allergenSourceType: allergenSourceTypes.officialAllergenMenu,
            allergens,
            officialAllergenCoveredIds: dairyQueenAllergenCoverage(),
            category,
            description:
              "Official Dairy Queen nutrition facts and allergy information table.",
            imageUrl: null,
            mayContain,
            name,
            nutritionFacts: nutritionFactsFromHeaderCells(headers, cells),
            sourceKind: "html-allergen-matrix",
            sourceUrl: url,
          }),
        );
      });
  });

  return records;
}

export function dairyQueenAllergenCoverage() {
  return [
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
}

function dairyQueenAllergenCodes(value) {
  const map = new Map([
    ["E", "egg"],
    ["F", "fish"],
    ["M", "milk"],
    ["P", "peanut"],
    ["S", "soy"],
    ["SF", "shellfish"],
    ["SS", "sesame"],
    ["T", "tree-nut"],
    ["W", "wheat"],
  ]);
  const direct = [];
  const mayContain = [];
  const normalized = String(value).replaceAll("/", "\\");
  const tokenPattern = /\((SF|SS|[EFMPSTW])\)|(SF|SS|[EFMPSTW])/g;
  let match;

  while ((match = tokenPattern.exec(normalized))) {
    const isMayContain = Boolean(match[1]);
    const allergen = map.get(match[1] ?? match[2]);

    if (!allergen) {
      continue;
    }

    if (isMayContain) {
      mayContain.push(allergen);
    } else {
      direct.push(allergen);
    }
  }

  return {
    allergens: uniqueStrings(direct),
    mayContain: uniqueStrings(mayContain),
  };
}

function extractXmlItems(text, restaurant, url, kind = sourceTypes.api) {
  return (
    extractXmlDocumentSchemaProfileItems(text, restaurant, url, kind) ?? []
  );
}

export function extractSpreadsheetItems(
  buffer,
  restaurant,
  url,
  kind = sourceTypes.allergen,
) {
  if (!buffer || (kind !== sourceTypes.allergen && kind !== sourceTypes.menu)) {
    return [];
  }

  let workbook;

  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  } catch {
    return [];
  }

  const records = [];

  for (const sheetName of workbook.SheetNames ?? []) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, {
      blankrows: false,
      defval: null,
      header: 1,
    });
    records.push(
      ...extractSpreadsheetMatrixRows(rows, restaurant, url, sheetName),
    );
  }

  return records;
}

function extractSpreadsheetMatrixRows(rows, restaurant, url, sheetName) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const allergenHeaderRowIndex = rows.findIndex((row) =>
    asArray(row).some((cell) => /^allergens?$/i.test(cleanText(cell) ?? "")),
  );

  if (allergenHeaderRowIndex < 0 || !rows[allergenHeaderRowIndex + 1]) {
    return [];
  }

  const labelRow = asArray(rows[allergenHeaderRowIndex]).map(cleanText);
  const allergenRow = asArray(rows[allergenHeaderRowIndex + 1]).map(cleanText);
  const allergenColumns = new Map();
  const nutritionColumns = new Map();

  for (
    let index = 1;
    index < Math.max(labelRow.length, allergenRow.length);
    index += 1
  ) {
    const allergenId = normalizeProviderAllergens([allergenRow[index]]).at(0);

    if (allergenId) {
      allergenColumns.set(index, allergenId);
      continue;
    }

    const nutritionLabel = normalizeSpreadsheetNutritionLabel(labelRow[index]);

    if (nutritionLabel) {
      nutritionColumns.set(index, nutritionLabel);
    }
  }

  if (allergenColumns.size === 0) {
    return [];
  }

  const records = [];
  let currentCategory = cleanText(sheetName) ?? restaurant.category;

  for (const row of rows.slice(allergenHeaderRowIndex + 2)) {
    const cells = asArray(row);
    const name = cleanMenuName(cells[0]);

    if (!name) {
      continue;
    }

    const hasNutritionValue = Array.from(nutritionColumns.keys()).some(
      (index) => isSpreadsheetMarkedValue(cells[index]),
    );
    const allergens = [];

    for (const [index, allergenId] of allergenColumns) {
      if (isSpreadsheetAllergenMarker(cells[index])) {
        allergens.push(allergenId);
      }
    }

    if (!hasNutritionValue && allergens.length === 0) {
      currentCategory = name;
      continue;
    }

    if (!isProbablyMenuItemName(name) || /^column\d+$/i.test(name)) {
      continue;
    }

    const nutritionFacts = {};

    for (const [index, label] of nutritionColumns) {
      const value = cells[index];

      if (isSpreadsheetMarkedValue(value)) {
        nutritionFacts[label] = value;
      }
    }

    records.push(
      createRecord({
        allergenSourceType:
          allergens.length > 0
            ? allergenSourceTypes.officialAllergenMenu
            : allergenSourceTypes.unavailable,
        allergens,
        category: currentCategory,
        description: "Official spreadsheet nutrition and allergen matrix.",
        evidenceText: `${name} ${allergens.join(", ")}`,
        name,
        nutritionFacts,
        sourceKind: "official-spreadsheet-matrix",
        sourceUrl: url,
        variantGroup: cleanText(sheetName),
      }),
    );
  }

  return records;
}

function normalizeSpreadsheetNutritionLabel(value) {
  const label = cleanText(value);

  if (!label || /^d$|^ss$/i.test(label) || /^nutrition facts$/i.test(label)) {
    return null;
  }

  return normalizeNutritionLabel(label) ?? label;
}

function isSpreadsheetMarkedValue(value) {
  return value !== null && value !== undefined && cleanText(value) !== "";
}

function isSpreadsheetAllergenMarker(value) {
  const text = cleanText(value);

  if (!text) {
    return false;
  }

  return /^(?:x|y|yes|contains?|present|✓|✔|●|•|\*)$/i.test(text);
}

function extractProductLinksFromXmlSitemap(text, url) {
  if (!/sitemap/i.test(url) && !/<urlset\b/i.test(text)) {
    return [];
  }

  const $ = cheerio.load(text, { xmlMode: true });
  const links = [];

  $("loc").each((_index, element) => {
    const href = absolutizeUrl(cleanText($(element).text()), url);

    if (!href || !isLikelyProductHref(href)) {
      return;
    }

    const name = menuNameFromProductUrl(href);

    if (
      !name ||
      !isProbablyMenuItemName(name) ||
      isDominosIngredientOnlyName(name)
    ) {
      return;
    }

    links.push({ name, url: href });
  });

  return uniqueBy(links, (link) => normalizeUrl(link.url));
}

function menuNameFromProductUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const segment = pathname.split("/").filter(Boolean).at(-1);

    if (!segment || /^\d+$/.test(segment)) {
      return null;
    }

    return titleCase(
      decodeURIComponent(segment)
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/-/g, " "),
    );
  } catch {
    return null;
  }
}

function extractDominosAllergenXmlItems(text, restaurant, url) {
  const $ = cheerio.load(text, { xmlMode: true });
  const allergenKeys = new Map([
    ["milk", "milk"],
    ["egg", "egg"],
    ["fish", "fish"],
    ["shellfish", "shellfish"],
    ["wheat", "wheat"],
    ["soy", "soy"],
    ["peanuts", "peanut"],
    ["nuts", "tree-nut"],
    ["sesame", "sesame"],
  ]);
  const records = [];
  const officialAllergenCoveredIds = dominosAllergenAttributeCoverage();

  $("menuSet[type='food-items'] item").each((_index, element) => {
    const $item = $(element);
    const name = cleanText($item.attr("title"));

    if (
      !name ||
      !isProbablyMenuItemName(name) ||
      isDominosIngredientOnlyName(name)
    ) {
      return;
    }

    const allergens = [];
    const mayContain = [];

    for (const [attribute, allergen] of allergenKeys) {
      const value = String($item.attr(attribute) ?? "").toLowerCase();

      if (value === "full") {
        allergens.push(allergen);
      } else if (value === "part" || value === "diamond") {
        mayContain.push(allergen);
      }
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        officialAllergenCoveredIds,
        category: restaurant.category,
        description: "Official Domino's allergen XML chart.",
        imageUrl: null,
        mayContain,
        name,
        sourceKind: "official-api",
        sourceUrl: url,
      }),
    );
  });

  return records;
}

export function dominosAllergenAttributeCoverage() {
  return [
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
}

function isDominosIngredientOnlyName(name) {
  return /^(?:PHASE OIL\s*\(BUTTER FLAVORED OIL\))$/i.test(
    String(name ?? "").trim(),
  );
}

function extractDominosNutritionXmlItems(text, restaurant, url) {
  const $ = cheerio.load(text, { xmlMode: true });
  const records = [];

  $("item, crust, sauce, cheese, topping, specialty").each(
    (_index, element) => {
      const $item = $(element);
      const rawName = $item.attr("type") ?? $item.attr("name");
      const name = cleanText(rawName);

      if (!name || !isProbablyMenuItemName(name)) {
        return;
      }

      const nutritionFacts = nutritionFactsFromDominosAttributes($item);

      if (!nutritionFacts) {
        return;
      }

      for (const alias of dominosNutritionAliases(name, element.tagName)) {
        records.push(
          createRecord({
            allergenSourceType: allergenSourceTypes.unavailable,
            allergens: [],
            category: restaurant.category,
            description: "Official Domino's Cal-O-Meter nutrition XML.",
            imageUrl: null,
            mayContain: [],
            name: alias,
            nutritionFacts,
            sourceKind: "api-nutrition",
            sourceUrl: url,
          }),
        );
      }
    },
  );

  return records;
}

function dominosNutritionAliases(name, tagName) {
  const aliases = new Set([name]);
  const upper = name.toUpperCase();
  aliases.add(upper);

  const aliasMap = new Map([
    ["5-Cheese Mac & Cheese Dish", ["5-CHEESE MAC & CHEESE", "5-CHEESE DIP"]],
    [
      "Bacon & Jalapeno Stuffed Cheesy Bread",
      ["BACON & JALAPENO STUFFED CHEESY BREAD"],
    ],
    ["Bacon Cheddar Hoagie", ["BACON CHEDDAR HOAGIE"]],
    [
      "Balsamic Vinaigrette Dressing",
      ["BALSAMIC DRESSING", "FAT-FREE RASPBERRY DRESSING"],
    ],
    ["Blue Cheese Dipping Cup", ["BLUE CHEESE DIPPING CUPS"]],
    ["BBQ Chicken Topping", ["BBQ CHICKEN WITH SAUCE"]],
    ["Buffalo Chicken", ["BUFFALO CHICKEN SANDWICH"]],
    ["Caesar Dressing", ["CAESAR DRESSING"]],
    ["Cheddar Bacon Loaded Tots", ["LOADED TOTS - CHEDDAR BACON"]],
    ["Chicken Alfredo", ["CHICKEN ALFREDO PASTA"]],
    ["Chicken Bacon Ranch", ["CHICKEN BACON RANCH SANDWICH"]],
    ["Chicken Parm", ["CHICKEN PARMESAN SANDWICH"]],
    ["Chorizo", ["CHORIZO/CHOURICO"]],
    ["Domino´s Marbled Cookie Brownie", ["DOMINO'S MARBLED COOKIE BROWNIE"]],
    ["1/2 bread bowl", ["BREAD BOWL"]],
    ["Garlic Bread Bites", ["GARLIC BREAD BITES"]],
    ["Garlic Dipping Cup", ["GARLIC DIPPING SAUCE"]],
    [
      "Garlic Oil Blend",
      ["GARLIC OIL BLEND", "PHASE OIL (BUTTER FLAVORED OIL)"],
    ],
    ["Garlic Parmesan White Sauce", ["GARLIC PARMESAN SAUCE (WHITE SAUCE)"]],
    ["Garlic Parmesan Wings", ["GARLIC PARMESAN CHICKEN WINGS"]],
    ["Hand Tossed", ["HAND TOSSED CRUST"]],
    ["Honey BBQ Dipping Cup", ["HONEY BBQ DIPPING CUP"]],
    ["Green Chile Peppers", ["GREEN CHILE PEPPER"]],
    ["Honey BBQ Sauce", ["HONEY BBQ SAUCE", "WING SAUCE, HONEY BBQ"]],
    ["Honey BBQ Wings", ["HONEY BBQ CHICKEN WINGS"]],
    ["Hot Buffalo Dipping Cup", ["HOT BUFFALO DIPPING CUP"]],
    [
      "Hot Buffalo Sauce",
      ["WING SAUCE, HOT BUFFALO", "WING SAUCE, MILD BUFFALO"],
    ],
    ["Hot Buffalo Wings", ["HOT BUFFALO CHICKEN WINGS"]],
    ["Italian", ["ITALIAN SANDWICH"]],
    ["Italian Sausage Marinara", ["ITALIAN SAUSAGE MARINARA PASTA"]],
    ["Kraft Catalina Dressing", ["KRAFT CATALINA SALAD DRESSING"]],
    ["Lite Balsamic with Olive Oil  Dressing", ["BALSAMIC DRESSING"]],
    [
      "Marinara Dipping Cup",
      ["MARINARA DIPPING SAUCE", "CHEESEY MARINARA DIP"],
    ],
    ["Melty 3-Cheese Loaded Tots", ["LOADED TOTS - MELTY 3-CHEESE"]],
    ["Mild Buffalo Wings", ["MILD BUFFALO CHICKEN WINGS"]],
    ["New York Style", ["NEW YORK STYLE CRUST"]],
    ["Parmesan", ["PARMESAN CHEESE (GRATED)", "PARMESAN CHEESE (PACKET)"]],
    ["Parmesan Bread Bites", ["PARMESAN BREAD BITES"]],
    [
      "Philly Cheese Steak",
      ["PHILLY CHEESE STEAK PIZZA", "PHILLY CHEESE STEAK SANDWICH"],
    ],
    ["Philly Cheese Steak Loaded Tots", ["LOADED TOTS - PHILLY CHEESE STEAK"]],
    [
      "Plain Wings, No sauce",
      ["PLAIN CHICKEN WINGS", "PLAIN CHICKEN WINGS (NO SAUCE)"],
    ],
    ["Premium Chicken", ["PREMIUM GRILLED CHICKEN"]],
    [
      "Ranch Dipping Cup",
      ["BUTTERMILK RANCH SAUCE", "RANCH DIPPING CUP", "RANCH DIPPING CUPS"],
    ],
    ["Ranch Dressing", ["RANCH DRESSING"]],
    ["Regular Cheese", ["CHEESE (PIZZA)"]],
    [
      "Robust Inspired Tomato Sauce",
      [
        "HEARTY MARINARA SAUCE",
        "PIZZA SAUCE",
        "PIZZA SAUCE (ROBUST INSPIRED TOMATO SAUCE)",
        "ROBUST INSPIRED TOMATO SAUCE",
      ],
    ],
    ["Salad, Chicken Caesar", ["CHICKEN CAESAR SALAD"]],
    ["Salad, Classic Garden", ["CLASSIC GARDEN SALAD"]],
    [
      "Spinach & Feta Stuffed Cheesy Bread",
      ["SPINACH & FETA STUFFED CHEESY BREAD"],
    ],
    ["Stuffed Cheesy Bread", ["STUFFED CHEESY BREAD"]],
    ["Sweet Icing Dipping Cup", ["SWEET ICING DIPPING CUP"]],
    [
      "Sweet Mango Habanero Chicken Wings",
      ["SWEET MANGO HABANERO CHICKEN WINGS"],
    ],
    ["Shredded Parmesan Asiago", ["PARMESAN-ASIAGO CHEESE"]],
    [
      "Shredded Provolone Cheese",
      ["PROVOLONE CHEESE (SHREDDED)", "PROVOLONE CHEESE (SLICED)"],
    ],
    [
      "Spicy Buffalo 5-Cheese Mac & Cheese Dish",
      ["SPICY BUFFALO 5-CHEESE MAC & CHEESE"],
    ],
    [
      "Sweet & Spicy Chicken Habanero",
      ["SWEET & SPICY CHICKEN HABANERO SANDWICH"],
    ],
    [
      "Sweet Mango Habanero Dipping Cup",
      [
        "SWEET MANGO HABANERO",
        "SWEET MANGO HABANERO DIPPING CUP",
        "SWEET MANGO HABANERO SAUCE DIPPING CUP",
      ],
    ],
  ]);

  if (tagName === "crust") {
    aliases.add(`${upper} CRUST`);
  }

  for (const alias of aliasMap.get(name) ?? []) {
    aliases.add(alias);
  }

  return Array.from(aliases).filter(Boolean);
}

function nutritionFactsFromDominosAttributes($item) {
  const facts = normalizeNutritionFacts({
    "Serving Size": $item.attr("gw") ? `${$item.attr("gw")} g` : null,
    Calories: $item.attr("calories"),
    "Total Fat": $item.attr("fat"),
    "Saturated Fat": $item.attr("satFat"),
    "Trans Fat": $item.attr("tFat"),
    Cholesterol: $item.attr("chol"),
    Sodium: $item.attr("sod"),
    "Total Carbohydrates": $item.attr("carb"),
    "Dietary Fiber": $item.attr("df"),
    Sugars: $item.attr("ts"),
    "Added Sugars": $item.attr("as"),
    Protein: $item.attr("prot"),
    "Vitamin D": $item.attr("vd"),
    Calcium: $item.attr("calc"),
    Iron: $item.attr("iron"),
    Potassium: $item.attr("potassium"),
  });

  return facts && Object.keys(facts).length > 1 ? facts : null;
}

async function extractDominosNutritionGuidePdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const records = [];
  let pending = null;

  for (const row of rows) {
    const parts = row.items.map((item) => cleanText(item.str)).filter(Boolean);

    if (parts.length === 0) {
      continue;
    }

    const parsed = parseDominosNutritionGuideRow(parts);

    if (parsed) {
      records.push(
        ...createDominosNutritionGuideRecords(parsed, restaurant, url),
      );
      pending = null;
      continue;
    }

    const numericParts = parts.filter(isNutritionValueToken);

    if (pending && numericParts.length >= 12) {
      records.push(
        ...createDominosNutritionGuideRecords(
          {
            name: pending.name,
            servingSize: pending.servingSize,
            values: numericParts.slice(0, 12),
          },
          restaurant,
          url,
        ),
      );
      pending = null;
      continue;
    }

    const pendingRow = parseDominosNutritionGuidePendingRow(parts);

    if (pendingRow) {
      pending = pendingRow;
    }
  }

  return records;
}

function parseDominosNutritionGuideRow(parts) {
  const lastNumericIndex = parts.findLastIndex((part) =>
    isNutritionValueToken(part),
  );

  if (lastNumericIndex < 0) {
    return null;
  }

  const numericTail = [];

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (!isNutritionValueToken(parts[index])) {
      break;
    }

    numericTail.unshift(parts[index]);
  }

  if (numericTail.length < 12) {
    return null;
  }

  const prefix = parts.slice(0, parts.length - numericTail.length);
  const name = cleanText(prefix[0]);

  if (!name || !isProbablyMenuItemName(name)) {
    return null;
  }

  const servingSize = cleanText(prefix.slice(1).join(" "));

  return {
    name,
    servingSize,
    values: numericTail.slice(0, 12),
  };
}

function parseDominosNutritionGuidePendingRow(parts) {
  if (
    parts.some((part) =>
      /^(serving size|weight \(g\)|calories|ingredient nutrition|domino's nutrition guide)$/i.test(
        part,
      ),
    )
  ) {
    return null;
  }

  if (parts.length < 2 || parts.some(isNutritionValueToken)) {
    return null;
  }

  const name = cleanText(parts[0]);
  const servingSize = cleanText(parts.slice(1).join(" "));

  if (!name || !servingSize || !isProbablyMenuItemName(name)) {
    return null;
  }

  return { name, servingSize };
}

function createDominosNutritionGuideRecords(parsed, restaurant, url) {
  const nutritionFacts = nutritionFactsFromDominosGuideValues(
    parsed.servingSize,
    parsed.values,
  );

  if (!nutritionFacts) {
    return [];
  }

  return dominosNutritionAliases(parsed.name, "pdf").map((alias) =>
    createRecord({
      allergenSourceType: allergenSourceTypes.unavailable,
      allergens: [],
      category: restaurant.category,
      description: "Official Domino's Nutrition Guide PDF.",
      imageUrl: null,
      mayContain: [],
      name: alias,
      nutritionFacts,
      sourceKind: "pdf-nutrition",
      sourceUrl: url,
    }),
  );
}

function nutritionFactsFromDominosGuideValues(servingSize, values) {
  const facts = normalizeNutritionFacts({
    "Serving Size": servingSize,
    Weight: values[0] ? `${values[0]} g` : null,
    Calories: values[1],
    "Total Fat": values[2],
    "Saturated Fat": values[3],
    "Trans Fat": values[4],
    Cholesterol: values[5],
    Sodium: values[6],
    "Total Carbohydrates": values[7],
    "Dietary Fiber": values[8],
    Sugars: values[9],
    "Added Sugars": values[10],
    Protein: values[11],
  });

  return facts && Object.keys(facts).length > 1 ? facts : null;
}

function isNutritionValueToken(value) {
  return /^-?\d+(?:\.\d+)?$/.test(String(value).trim());
}

export function extractChickFilAAllergenItems($, restaurant, url) {
  const text = $(
    "script[type='application/json']#wp-script-module-data-\\@wordpress\\/interactivity",
  )
    .contents()
    .text()
    .trim();
  const parsed = parseJsonLoose(text);
  const sections =
    parsed?.state?.["nutrition-allergens-table-store"]?.tableData?.allergens;
  const nutritionSections =
    parsed?.state?.["nutrition-allergens-table-store"]?.tableData?.nutrition;

  if (!Array.isArray(sections)) {
    return [];
  }

  const records = [];
  const nutritionByTitle = new Map();

  for (const section of asArray(nutritionSections)) {
    for (const item of asArray(section?.items)) {
      const title = normalizeMenuName(item?.title);

      if (title) {
        nutritionByTitle.set(title, nutritionFactsFromFieldList(item.fields));
      }
    }
  }

  for (const section of sections) {
    const category = cleanText(section?.menu) ?? restaurant.category;

    for (const item of section?.items ?? []) {
      const name = cleanText(item?.title);

      // This embedded first-party table is already a trusted menu boundary.
      // Generic name heuristics reject legitimate fraction variants such as
      // "1/2 Sweet Tea, 1/2 Lemonade".
      if (!name) {
        continue;
      }

      const { allergens, coveredAllergenIds } =
        chickFilAAllergenFacts(item.fields);

      records.push(
        createRecord({
          allergenSourceType:
            coveredAllergenIds.length > 0
              ? allergenSourceTypes.officialAllergenMenu
              : allergenSourceTypes.unavailable,
          allergens,
          officialAllergenCoveredIds: coveredAllergenIds,
          category,
          description: "Official Chick-fil-A nutrition and allergens table.",
          imageUrl: null,
          mayContain: [],
          name,
          nutritionFacts: nutritionByTitle.get(normalizeMenuName(name)),
          sourceKind: "official-api",
          sourceUrl: item.link ?? url,
        }),
      );
    }
  }

  return records;
}

export function chickFilAAllergenFacts(fields = []) {
  const allergenByField = new Map([
    ["milk", "milk"],
    ["egg", "egg"],
    ["soy", "soy"],
    ["wheat", "wheat"],
    ["sesame", "sesame"],
    ["tree_nuts", "tree-nut"],
    ["peanut", "peanut"],
    ["fish", "fish"],
  ]);
  const allergens = [];
  const coveredAllergenIds = [];

  for (const field of fields ?? []) {
    const allergenId = allergenByField.get(String(field?.key ?? ""));
    const screenReaderText = cleanText(field?.["sr-text"]) ?? "";

    if (
      !allergenId ||
      !/^(?:contains|does not contain)\b/i.test(screenReaderText)
    ) {
      continue;
    }

    coveredAllergenIds.push(allergenId);
    if (String(field?.value ?? "") === "1") {
      allergens.push(allergenId);
    }
  }

  return {
    allergens: uniqueStrings(allergens).sort(),
    coveredAllergenIds: uniqueStrings(coveredAllergenIds).sort(),
  };
}

export function extractOfficialApiItems(
  text,
  restaurant,
  url,
  kind = sourceTypes.api,
) {
  if (/\/api\/menu\b/i.test(url) && isDardenPlatformUrl(url)) {
    return [];
  }

  const parsed = parseJsonLoose(text);

  if (!parsed) {
    return [];
  }

  const profileRecords = extractOfficialApiDocumentSchemaProfileItems(
    parsed,
    restaurant,
    url,
  );

  if (profileRecords) {
    return profileRecords;
  }

  return [
    ...extractProviderAllergenRecords(parsed, restaurant, url),
    ...extractRecordsFromObject(parsed, restaurant, url, "official-api", kind),
  ];
}

function extractOfficialApiDocumentSchemaProfileItems(parsed, restaurant, url) {
  const adapter = getBrandAdapter(restaurant.id);
  const profile = officialApiDocumentSchemaProfiles.find((candidate) =>
    documentSchemaProfileMatches(candidate, {
      adapter,
      contentKind: "json",
      restaurant,
      url,
    }),
  );

  return profile ? profile.extract({ parsed, restaurant, url }) : null;
}

function extractHtmlDocumentSchemaProfile($, restaurant, url, kind) {
  const adapter = getBrandAdapter(restaurant.id);
  const profile = documentSchemaProfiles.find((candidate) =>
    documentSchemaProfileMatches(candidate, {
      $,
      adapter,
      contentKind: "html",
      kind,
      restaurant,
      url,
    }),
  );

  return profile
    ? {
        exclusive: profile.exclusive === true,
        items: profile.extract({ $, kind, restaurant, url }),
      }
    : null;
}

function extractXmlDocumentSchemaProfileItems(text, restaurant, url, kind) {
  const adapter = getBrandAdapter(restaurant.id);
  const profile = documentSchemaProfiles.find((candidate) =>
    documentSchemaProfileMatches(candidate, {
      adapter,
      contentKind: "xml",
      kind,
      restaurant,
      text,
      url,
    }),
  );

  return profile ? profile.extract({ kind, restaurant, text, url }) : null;
}

const officialApiDocumentSchemaProfiles = [
  {
    id: "square-online-products-api",
    contentKind: "json",
    outputType: "menu",
    urlPattern:
      /\/app\/store\/api\/v\d+\/editor\/users\/[^/?#]+\/sites\/[^/?#]+\/products/i,
    extract: ({ parsed, restaurant, url }) =>
      extractSquareOnlineProductItems(parsed, restaurant, url),
  },
  {
    id: "olo-vendor-menu-api",
    contentKind: "json",
    outputType: "menu",
    urlPattern: /\/api\/vendors\/[^/?#]+/i,
    extract: ({ parsed, restaurant, url }) =>
      extractOloVendorMenuItems(parsed, restaurant, url),
  },
  {
    id: "lunchbox-nova-menu-api",
    contentKind: "json",
    outputType: "menu",
    urlPattern: /\/api\/v\d+\/stores\/[^/?#]+\/menus/i,
    extract: ({ parsed, restaurant, url }) =>
      extractLunchboxNovaMenuItems(parsed, restaurant, url),
  },
  {
    id: "chipotle-nutrition-api",
    brandKeys: ["chipotle"],
    contentKind: "json",
    outputType: "official-nutrition",
    urlPattern: /\/menu-metadata\/nutrition/i,
    extract: ({ parsed, restaurant, url }) =>
      extractChipotleNutritionApiItems(parsed, restaurant, url),
  },
];

function extractSquareOnlineProductItems(parsed, restaurant, url) {
  const products = asArray(parsed?.data);

  if (products.length === 0) {
    return [];
  }

  const records = [];

  for (const product of products) {
    const name = pickString(product?.name);

    if (
      !name ||
      !isProbablyMenuItemName(name) ||
      isSquareOnlineModifierProductName(name) ||
      !isSquareOnlineFoodProduct(product) ||
      /hidden|unavailable|deleted/i.test(pickString(product?.visibility) ?? "")
    ) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.unavailable,
        allergens: [],
        category: squareOnlineProductCategory(product, restaurant),
        description:
          pickString(product?.short_description) ??
          pickString(product?.description) ??
          pickString(product?.seo_page_description) ??
          null,
        imageUrl: squareOnlineProductImageUrl(product, url),
        mayContain: [],
        name,
        sourceKind: "square-online-api",
        sourceUrl: url,
        variantGroup: asArray(product?.categoryIds).join("|") || null,
      }),
    );
  }

  return records;
}

function extractLunchboxNovaMenuItems(parsed, restaurant, url) {
  const menus = Array.isArray(parsed) ? parsed : asArray(parsed?.data);

  if (menus.length === 0) {
    return [];
  }

  const records = [];

  for (const menu of menus) {
    for (const category of asArray(menu?.categories)) {
      const categoryName = pickString(category?.name) ?? restaurant.category;

      for (const item of asArray(category?.items)) {
        const name = pickString(item?.name);

        if (
          !name ||
          !isProbablyMenuItemName(name) ||
          item?.is_out_of_stock === true ||
          item?.is_available === false
        ) {
          continue;
        }

        const description =
          pickString(item?.long_desc) ??
          pickString(item?.short_desc) ??
          pickString(item?.description) ??
          null;
        const allergens = lunchboxNovaAllergensForItem(item);

        if (!description && !hasFoodLanguage(name) && allergens.length === 0) {
          continue;
        }

        records.push(
          createRecord({
            allergenSourceType:
              allergens.length > 0
                ? allergenSourceTypes.officialProductAllergenSection
                : allergenSourceTypes.unavailable,
            allergens,
            category: categoryName,
            description,
            imageUrl: lunchboxNovaImageUrl(item),
            ingredientsText: description,
            mayContain: [],
            name,
            sourceKind: "lunchbox-nova-menu-api",
            sourceUrl: url,
            variantGroup: categoryName,
          }),
        );
      }
    }
  }

  return uniqueBy(
    records,
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );
}

function lunchboxNovaAllergensForItem(item) {
  const classNames = new Set([
    ...Object.entries(item?.classes ?? {})
      .filter(([, value]) => value === true)
      .map(([key]) => key),
    ...asArray(item?.class_names),
    ...asArray(item?.classNames),
  ]);
  const ids = new Set();

  for (const value of classNames) {
    const normalized = normalizeMenuName(value).replace(/-/g, "_");

    for (const allergen of lunchboxNovaAllergenIdsForClass(normalized)) {
      ids.add(allergen);
    }
  }

  return [...ids];
}

function lunchboxNovaAllergenIdsForClass(value) {
  if (!value || /\b(?:free|available|vegan|vegetarian)\b/i.test(value)) {
    return [];
  }

  const mappings = [
    [/contains.*(?:dairy|milk)|(?:dairy|milk).*contains/i, ["milk"]],
    [/contains.*eggs?|eggs?.*contains/i, ["egg"]],
    [/contains.*wheat|wheat.*contains/i, ["wheat"]],
    [/contains.*gluten|gluten.*contains/i, ["gluten"]],
    [/contains.*soy|soy.*contains/i, ["soy"]],
    [/contains.*sesame|sesame.*contains/i, ["sesame"]],
    [/contains.*(?:peanut|peanuts)|(?:peanut|peanuts).*contains/i, ["peanut"]],
    [
      /contains.*(?:tree_nut|tree nuts?|nuts?)|(?:tree_nut|tree nuts?|nuts?).*contains/i,
      ["tree-nut"],
    ],
    [/contains.*fish|fish.*contains/i, ["fish"]],
    [/contains.*shellfish|shellfish.*contains/i, ["shellfish"]],
  ];

  return mappings.find(([pattern]) => pattern.test(value))?.[1] ?? [];
}

function lunchboxNovaImageUrl(item) {
  const images = item?.image_urls ?? item?.imageUrls ?? {};

  return (
    pickImage(images.standard) ??
    pickImage(images.thumbnail) ??
    pickImage(images.standard_mobile) ??
    pickImage(images.thumbnail_mobile) ??
    pickImage(item?.image_url) ??
    pickImage(item?.imageUrl)
  );
}

function isSquareOnlineModifierProductName(name) {
  return /^(?:add|extra|substitute|no)\b/i.test(name);
}

function isSquareOnlineFoodProduct(product) {
  const type = pickString(product?.product_type);

  if (type && !/food|physical/i.test(type)) {
    return false;
  }

  if (product?.is_alcoholic === true) {
    return false;
  }

  const haystack = [
    product?.name,
    product?.short_description,
    product?.description,
    product?.seo_page_title,
    product?.seo_page_description,
  ]
    .map((value) => cleanText(pickString(value) ?? ""))
    .filter(Boolean)
    .join(" ");

  return !/\b(?:gift\s*card|merch|shirt|hoodie|hat|mug|sticker)\b/i.test(
    haystack,
  );
}

function squareOnlineProductCategory(product, restaurant) {
  return (
    pickString(product?.category?.name) ??
    pickString(product?.categories?.data?.[0]?.name) ??
    pickString(product?.categories?.[0]?.name) ??
    restaurant.category
  );
}

function squareOnlineProductImageUrl(product, url) {
  const image =
    pickImage(asArray(product?.images?.data)[0]) ??
    pickImage(asArray(product?.media_files?.data)[0]) ??
    pickString(product?.thumbnail?.data?.absolute_url) ??
    pickString(product?.thumbnail?.data?.url);

  return absolutizeUrl(image, url);
}

function extractChipotleNutritionApiItems(parsed, restaurant, url) {
  const nameById = new Map([
    ["CMG-4", "Barbacoa"],
    ["CMG-5051", "Black Beans"],
    ["CMG-5002", "Brown Rice"],
    ["CMG-3", "Carnitas"],
    ["CMG-1", "Chicken"],
    ["CMG-5353", "Chipotle Honey Vinaigrette"],
    ["CMG-1002", "Crispy Corn Tortilla"],
    ["CMG-5101", "Fajita Vegetables"],
    ["CMG-4025", "Flour Tortilla (Burrito)"],
    ["CMG-5501", "Flour Tortilla (Taco)"],
    ["CMG-5201", "Fresh Tomato Salsa"],
    ["CMG-1001", "Guacamole"],
    ["CMG-5252", "Monterey Jack Cheese"],
    ["CMG-5052", "Pinto Beans"],
    ["CMG-1029", "Queso Blanco"],
    ["CMG-5410", "Red Chimichurri Sauce"],
    ["CMG-5202", "Roasted Chili-Corn Salsa"],
    ["CMG-5351", "Romaine Lettuce"],
    ["CMG-5", "Sofritas"],
    ["CMG-5251", "Sour Cream"],
    ["CMG-2", "Steak"],
    ["CMG-5351", "Supergreens Lettuce Blend"],
    ["CMG-5203", "Tomatillo Green-Chili Salsa"],
    ["CMG-5204", "Tomatillo Red-Chili Salsa"],
    ["CMG-1002", "Tortilla Chips"],
    ["CMG-5001", "White Rice"],
  ]);
  const records = [];

  for (const [id, item] of Object.entries(parsed?.items ?? {})) {
    const names = chipotleNamesForNutritionId(id, nameById);
    const nutritionFacts = nutritionFactsFromChipotleApiItem(item);

    if (
      names.length === 0 ||
      !nutritionFacts ||
      Object.keys(nutritionFacts).length === 0
    ) {
      continue;
    }

    for (const name of names) {
      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.unavailable,
          allergens: [],
          category: restaurant.category,
          description:
            item?.description ?? item?.longDescription ?? null,
          imageUrl: absolutizeUrl(item?.thumbnailUrl, url),
          mayContain: [],
          name,
          nutritionFacts,
          sourceKind: "api-nutrition",
          sourceUrl: url,
        }),
      );
    }
  }

  return records;
}

function extractOloVendorMenuItems(parsed, restaurant, url) {
  const categories = asArray(parsed?.categories);
  const products = asArray(parsed?.products);

  if (categories.length === 0 || products.length === 0) {
    return [];
  }

  const categoryById = new Map(
    categories.map((category) => [String(category.id), category]),
  );
  const records = [];

  for (const product of products) {
    const name = pickString(product?.name);

    if (
      !name ||
      !isProbablyMenuItemName(name) ||
      product?.isDisabled === true
    ) {
      continue;
    }

    const category = categoryById.get(String(product.category));
    const description =
      pickString(product.description) ??
      pickString(product.shortDescription) ??
      null;

    if (
      /^catering$/i.test(pickString(category?.name) ?? "") &&
      !description &&
      product?.baseCost == null &&
      asArray(product?.images).length === 0
    ) {
      continue;
    }

    const labelText = asArray(product.labels)
      .map((label) => pickString(label?.name ?? label))
      .filter(Boolean)
      .join(" ");
    const allergenSignals = findAllergensInText(labelText);

    records.push(
      createRecord({
        allergenSourceType:
          allergenSignals.length > 0
            ? allergenSourceTypes.officialProductAllergenSection
            : allergenSourceTypes.unavailable,
        allergens: allergenSignals,
        category: pickString(category?.name) ?? restaurant.category,
        description,
        imageUrl: oloProductImageUrl(product, url),
        mayContain: [],
        name,
        sourceKind: "json-structured",
        sourceUrl: url,
        variantGroup: category?.id ? String(category.id) : null,
      }),
    );
  }

  return records;
}

function oloProductImageUrl(product, url) {
  const image =
    asArray(product?.images).find((candidate) =>
      /mobile-webapp-menu|responsive|customize/i.test(
        candidate?.groupName ?? "",
      ),
    ) ?? asArray(product?.images)[0];

  return absolutizeUrl(pickString(image?.filename) ?? pickImage(image), url);
}

function chipotleNamesForNutritionId(id, nameById) {
  if (id === "CMG-5351") {
    return ["Romaine Lettuce", "Supergreens Lettuce Blend"];
  }

  if (id === "CMG-1002") {
    return ["Crispy Corn Tortilla", "Tortilla Chips"];
  }

  return nameById.has(id) ? [nameById.get(id)] : [];
}

function nutritionFactsFromChipotleApiItem(item) {
  const nutrition = item?.nutrition;

  if (!nutrition || typeof nutrition !== "object") {
    return null;
  }

  return normalizeNutritionFacts({
    "Serving Size": item?.portion
      ? `${item.portion.value ?? ""} ${item.portion.unit ?? ""}`.trim()
      : null,
    Calories: nutrition.tcal,
    "Calories from Fat": nutrition.calf,
    "Total Fat": nutrition.tfat,
    "Saturated Fat": nutrition.satu,
    "Trans Fat": nutrition.tran,
    Sodium: nutrition.sodi,
    "Total Carbohydrates": nutrition.carb,
    "Dietary Fiber": nutrition.fibe,
    Sugars: nutrition.suga,
    Protein: nutrition.prot,
    Calcium: nutrition.calc,
    Iron: nutrition.iron,
    "Vitamin A": nutrition.vita,
    "Vitamin C": nutrition.vitc,
  });
}

function extractProviderAllergenRecords(parsed, restaurant, url) {
  const nodes = Array.isArray(parsed?.allergens)
    ? parsed.allergens
    : Array.isArray(parsed?.items)
      ? parsed.items
      : Array.isArray(parsed)
        ? parsed
        : [];

  return nodes
    .map((node) => {
      const name =
        pickString(node?.name) ??
        pickString(node?.title) ??
        pickString(node?.displayName);

      if (
        !name ||
        !isProbablyMenuItemName(name) ||
        !Array.isArray(node?.allergens)
      ) {
        return null;
      }

      const allergens = normalizeProviderAllergens(node.allergens);

      return createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        officialAllergenCoveredIds:
          restaurant.id === "chipotle"
            ? chipotleOfficialAllergenCoverage()
            : [],
        category: restaurant.category,
        description:
          allergens.length > 0
            ? `Official allergen flags: ${allergens.join(", ")}.`
            : "Official allergen source lists no major allergens for this item.",
        imageUrl: null,
        mayContain: [],
        name,
        sourceKind: "official-api",
        sourceUrl: url,
      });
    })
    .filter(Boolean);
}

export function chipotleOfficialAllergenCoverage() {
  return [
    "egg",
    "fish",
    "gluten",
    "milk",
    "mustard",
    "peanut",
    "sesame",
    "shellfish",
    "soy",
    "sulfites",
    "tree-nut",
    "wheat",
  ];
}

function extractHtmlAllergenMatrixItems($, restaurant, url, kind) {
  if (kind !== sourceTypes.allergen) {
    return [];
  }

  const records = [];

  $("table").each((_tableIndex, table) => {
    const rows = $(table)
      .find("tr")
      .toArray()
      .map((row) =>
        $(row)
          .find("th,td")
          .toArray()
          .map((cell) => htmlAllergenMatrixCellText($, cell)),
      )
      .filter((cells) => cells.some(Boolean));
    const header = rows.find((cells) => {
      const allergenColumnCount = cells.slice(1).filter((cell) => {
        const normalized = normalizeMenuName(cell);
        return (
          !/\b(?:free|without|no)\b/i.test(normalized) &&
          htmlAllergenMatrixHeaderAllergens(cell).length > 0
        );
      }).length;
      const firstCell = cleanText(cells[0]) ?? "";
      const firstCellLooksLikeItemHeader =
        /^(?:item|menu item|product|name|flavor|food)$/i.test(firstCell);
      const firstCellLooksLikeCategory =
        firstCell.length > 1 &&
        !/\b(?:calories?|fat|sodium|carbohydrates?|protein|sugars?|fiber|cholesterol)\b/i.test(
          firstCell,
        ) &&
        htmlAllergenMatrixHeaderAllergens(firstCell).length === 0;

      return (
        allergenColumnCount >= 3 &&
        (firstCellLooksLikeItemHeader || firstCellLooksLikeCategory)
      );
    });

    if (!header) {
      return;
    }

    const headerIndex = rows.indexOf(header);
    const allergenColumns = header.map((cell, index) => ({
      allergens: htmlAllergenMatrixHeaderAllergens(cell),
      index,
    }));
    let currentCategory = /^(?:item|menu item|product|name|flavor|food)$/i.test(
      header[0] ?? "",
    )
      ? restaurant.category
      : (cleanText(header[0]) ?? restaurant.category);

    for (const cells of rows.slice(headerIndex + 1)) {
      const name = cleanText(cells[0]);

      if (!name) {
        continue;
      }

      if (cells.length === 1 || cells.slice(1).every((cell) => !cell)) {
        currentCategory = name;
        continue;
      }

      if (!isProbablyMenuItemName(name)) {
        continue;
      }

      const direct = [];
      const mayContain = [];

      for (const column of allergenColumns) {
        if (column.index === 0 || column.allergens.length === 0) {
          continue;
        }

        const cell = cells[column.index] ?? "";

        if (/\bmay\b/i.test(cell)) {
          mayContain.push(...column.allergens);
        } else if (htmlAllergenMatrixCellIsDirectMarker(cell)) {
          direct.push(...column.allergens);
        }
      }

      if (direct.length === 0 && mayContain.length === 0) {
        continue;
      }

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens: direct,
          category: currentCategory,
          description: "Official allergen matrix.",
          evidenceText: allergenMatrixEvidenceText(name, direct, mayContain),
          imageUrl: null,
          mayContain,
          name,
          sourceKind: "html-allergen-matrix",
          sourceUrl: url,
        }),
      );
    }
  });

  records.push(...extractDivHtmlAllergenMatrixItems($, restaurant, url));
  records.push(...extractSvgAllergenMatrixItems($, restaurant, url));
  records.push(...extractClassGridHtmlAllergenMatrixItems($, restaurant, url));

  return records;
}

function extractClassGridHtmlAllergenMatrixItems($, restaurant, url) {
  const records = [];

  $(
    ".alergia-grid, .allergy-grid, [class*='allergia-grid'], [class*='alergia-grid']",
  ).each((_gridIndex, grid) => {
    const $grid = $(grid);
    const $header = $grid
      .find(
        ".alergia-grid__row--header, .allergy-grid__row--header, [class*='grid__row--header']",
      )
      .first();
    const category =
      normalizeGenericMatrixCategory(
        $header
          .find(
            ".alergia-grid__item-name, .allergy-grid__item-name, [class*='grid__item-name']",
          )
          .first()
          .text(),
      ) ??
      normalizeGenericMatrixCategory(
        $grid.closest("section,article,div").find("h1,h2,h3").first().text(),
      ) ??
      restaurant.category;
    const headers = $header
      .find(
        ".alergia-grid__cell--header-label, .allergy-grid__cell--header-label, [class*='header-label']",
      )
      .toArray()
      .map((node, index) => ({
        allergens: htmlAllergenMatrixHeaderAllergens($(node).text()),
        index,
      }))
      .filter((header) => header.allergens.length > 0);

    if (headers.length < 2) {
      return;
    }

    $grid
      .find(".alergia-grid__row, .allergy-grid__row, [class*='grid__row']")
      .not($header)
      .each((_rowIndex, row) => {
        const $row = $(row);
        const name = cleanText(
          $row
            .find(
              ".alergia-grid__item-name, .allergy-grid__item-name, [class*='grid__item-name']",
            )
            .first()
            .text(),
        );

        if (!name || !isProbablyMenuItemName(name)) {
          return;
        }

        const cells = $row
          .find(
            ".alergia-grid__cell, .allergy-grid__cell, [class*='grid__cell']",
          )
          .toArray()
          .filter((node) => isAllergenGridCellElement($(node).attr("class")));
        const direct = [];

        for (const header of headers) {
          const $cell = $(cells[header.index]);
          const cellText =
            cleanText(
              [
                $cell.text(),
                $cell.attr("aria-label"),
                $cell.attr("data-label"),
                $cell
                  .find("img[alt]")
                  .toArray()
                  .map((node) => $(node).attr("alt"))
                  .join(" "),
              ]
                .filter(Boolean)
                .join(" "),
            ) ?? "";

          if (
            $cell.find("img,svg,.fa-check,.fas.fa-check,[class*='check']")
              .length > 0 ||
            htmlAllergenMatrixCellIsDirectMarker(cellText) ||
            normalizeProviderAllergens([cellText]).length > 0
          ) {
            direct.push(...header.allergens);
          }
        }

        if (direct.length === 0) {
          return;
        }

        records.push(
          createRecord({
            allergenSourceType: allergenSourceTypes.officialAllergenMenu,
            allergens: uniqueStrings(direct),
            category,
            description: "Official allergen matrix.",
            evidenceText: allergenMatrixEvidenceText(name, direct),
            imageUrl: null,
            mayContain: [],
            name,
            sourceKind: "class-grid-allergen-matrix",
            sourceUrl: url,
          }),
        );
      });
  });

  return uniqueBy(
    records,
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );
}

function isAllergenGridCellElement(className) {
  return /(?:^|\s)(?:alergia|allergy)-grid__cell(?:\s|$)/i.test(
    String(className ?? ""),
  );
}

function extractSvgAllergenMatrixItems($, restaurant, url) {
  const records = [];

  $("svg").each((_svgIndex, svg) => {
    const $svg = $(svg);
    const svgLabel =
      cleanText(
        [
          $svg.attr("aria-label"),
          $svg.attr("role"),
          $svg.find("title").first().text(),
        ]
          .filter(Boolean)
          .join(" "),
      ) ?? "";
    const textNodes = $svg
      .find("text")
      .toArray()
      .map((node, index) => {
        const point = svgTranslatePoint($(node).attr("transform"));

        return {
          index,
          text: cleanText($(node).text()),
          x: point?.x,
          y: point?.y,
        };
      })
      .filter(
        (node) =>
          node.text && Number.isFinite(node.x) && Number.isFinite(node.y),
      );

    if (
      textNodes.length < 5 ||
      !/(?:allergen|allergy|allergies)/i.test(
        `${svgLabel} ${textNodes
          .map((node) => node.text)
          .slice(0, 12)
          .join(" ")}`,
      )
    ) {
      return;
    }

    const headerNodes = textNodes
      .filter((node) => node.y <= 40)
      .map((node) => ({
        allergens: htmlAllergenMatrixHeaderAllergens(node.text),
        text: node.text,
        x: node.x,
      }))
      .filter((node) => node.allergens.length > 0 && node.x > 150);

    if (headerNodes.length < 2) {
      return;
    }

    const marks = $svg
      .find("path")
      .toArray()
      .map((node) => {
        const point = svgPathInitialPoint($(node).attr("d"));
        const fill = String($(node).attr("fill") ?? "").toLowerCase();

        return point && isSvgAllergenCheckPath(fill, $(node).attr("d"))
          ? point
          : null;
      })
      .filter(Boolean);

    if (marks.length < 2) {
      return;
    }

    let currentCategory = restaurant.category;
    const rowNodes = textNodes
      .filter((node) => node.x <= 140 && node.y > 30)
      .sort((a, b) => a.y - b.y || a.index - b.index);

    for (const node of rowNodes) {
      if (isSvgAllergenMatrixSection(node.text)) {
        currentCategory =
          normalizeGenericMatrixCategory(node.text) ?? node.text;
        continue;
      }

      if (!isProbablyMenuItemName(node.text)) {
        continue;
      }

      const direct = [];
      const rowMarks = marks.filter((mark) => Math.abs(mark.y - node.y) <= 8);

      for (const mark of rowMarks) {
        const column = closestSvgAllergenHeader(mark, headerNodes);

        if (column) {
          direct.push(...column.allergens);
        }
      }

      if (direct.length === 0) {
        continue;
      }

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens: uniqueStrings(direct),
          category: currentCategory,
          description: "Official allergen matrix.",
          evidenceText: allergenMatrixEvidenceText(node.text, direct),
          imageUrl: null,
          mayContain: [],
          name: node.text,
          sourceKind: "svg-allergen-matrix",
          sourceUrl: url,
        }),
      );
    }
  });

  return uniqueBy(
    records,
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );
}

function svgTranslatePoint(value) {
  const match = String(value ?? "").match(
    /translate\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i,
  );

  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}

function svgPathInitialPoint(value) {
  const match = String(value ?? "").match(
    /[mM]\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/,
  );

  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}

function isSvgAllergenCheckPath(fill, d) {
  return (
    fill &&
    ![
      "none",
      "#fcb525",
      "#f0f1f1",
      "#ffffff",
      "#fff",
      "#000000",
      "#000",
    ].includes(fill) &&
    /\d/.test(String(d ?? ""))
  );
}

function isSvgAllergenMatrixSection(text) {
  const cleaned = cleanText(text) ?? "";

  return (
    cleaned.length > 2 &&
    cleaned === cleaned.toUpperCase() &&
    !/\d/.test(cleaned) &&
    !/\b(?:PLNT|B\.I\.G|DBL|BBQ)\b/i.test(cleaned)
  );
}

function closestSvgAllergenHeader(mark, headers) {
  const closest = headers.reduce(
    (best, header) => {
      const distance = Math.abs(header.x - mark.x);

      return distance < best.distance ? { distance, header } : best;
    },
    { distance: Number.POSITIVE_INFINITY, header: null },
  );

  return closest.distance <= 70 ? closest.header : null;
}

function extractDivHtmlAllergenMatrixItems($, restaurant, url) {
  const records = [];

  $(".flex-block-header, [class*='flex-block-header']").each(
    (_headerIndex, header) => {
      const $header = $(header);
      const rawCategory = cleanText(
        $header
          .find(
            ".allergey-chart---dish-header, .allergy-chart---dish-header, [class*='dish-header']",
          )
          .first()
          .text(),
      );
      const currentCategory =
        normalizeGenericMatrixCategory(rawCategory) ??
        rawCategory ??
        restaurant.category;
      const columns = $header
        .find(".allergy-chart---allergen-header, [class*='allergen-header']")
        .toArray()
        .map((node, index) => ({
          allergens: htmlAllergenMatrixHeaderAllergens($(node).text()),
          index,
        }))
        .filter((column) => column.allergens.length > 0);

      if (columns.length < 2) {
        return;
      }

      const $list = $header
        .nextAll(".w-dyn-list, [class*='w-dyn-list']")
        .first();
      const $items = $list.find(
        ".collection-item-allergy-chart, [class*='collection-item-allergy-chart']",
      );

      $items.each((_itemIndex, item) => {
        const $item = $(item);
        const name = cleanText(
          $item
            .find(".allergey-chart---dish, .allergy-chart---dish")
            .first()
            .text(),
        );

        if (!name || !isProbablyMenuItemName(name)) {
          return;
        }

        const cells = $item
          .find(".allergy-chart---allergen")
          .toArray()
          .map((node) => cleanText($(node).text()) ?? "");
        const direct = [];

        for (const column of columns) {
          const cell = cells[column.index] ?? "";

          if (
            htmlAllergenMatrixCellIsDirectMarker(cell) ||
            normalizeProviderAllergens([cell]).length > 0
          ) {
            direct.push(...column.allergens);
          }
        }

        if (direct.length === 0) {
          return;
        }

        const details = cleanText($item.find(".text-block-37").first().text());

        records.push(
          createRecord({
            allergenSourceType: allergenSourceTypes.officialAllergenMenu,
            allergens: uniqueStrings(direct),
            category: currentCategory,
            description: details
              ? `Official allergen matrix. ${details}`
              : "Official allergen matrix.",
            evidenceText: allergenMatrixEvidenceText(name, direct, [], details),
            imageUrl: null,
            mayContain: [],
            name,
            sourceKind: "html-allergen-matrix",
            sourceUrl: url,
          }),
        );
      });
    },
  );

  return uniqueBy(
    records,
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );
}

function allergenMatrixEvidenceText(
  name,
  directAllergens,
  mayContainAllergens = [],
  detailText = null,
) {
  const direct = uniqueStrings(directAllergens ?? []);
  const mayContain = uniqueStrings(mayContainAllergens ?? []);
  const parts = [];

  if (direct.length > 0) {
    parts.push(`contains ${direct.join(", ")}`);
  }

  if (mayContain.length > 0) {
    parts.push(`may contain ${mayContain.join(", ")}`);
  }

  const details = cleanText(detailText);
  if (details) {
    parts.push(details);
  }

  return `Official allergen matrix row: ${name}${parts.length > 0 ? `: ${parts.join("; ")}` : ""}.`;
}

function htmlAllergenMatrixCellText($, cell) {
  const $cell = $(cell);
  const parts = [
    $cell.text(),
    $cell.attr("aria-label"),
    $cell.attr("data-label"),
    $cell
      .find("[aria-label]")
      .toArray()
      .map((node) => $(node).attr("aria-label"))
      .join(" "),
    $cell.find(".fa-check,.fas.fa-check,.icon-check,[class*='check']").length >
    0
      ? "checked"
      : "",
  ];

  return cleanText(parts.filter(Boolean).join(" ")) ?? "";
}

function htmlAllergenMatrixHeaderAllergens(cell) {
  const normalized = cleanText(cell) ?? "";

  if (/\b(?:free|without|no)\b/i.test(normalized)) {
    return [];
  }

  return uniqueStrings([
    ...normalizeProviderAllergens([normalized]),
    ...findAllergensInText(normalized),
  ]);
}

function htmlAllergenMatrixCellIsDirectMarker(cell) {
  const normalized = cleanText(cell) ?? "";

  if (!normalized || /^[-–—]$/.test(normalized)) {
    return false;
  }

  return (
    /^(?:x|yes|y|checked|contains)$/i.test(normalized) ||
    /✔|✓|●|check|contains/i.test(normalized)
  );
}

function extractAndPizzaAllergenGuideItems($, restaurant, url) {
  const records = [];

  $(".allergen_table table").each((_tableIndex, table) => {
    const tableModule = $(table).closest(".dipi_table_maker");
    const headingModule = tableModule.prevAll(".et_pb_text").first();
    const heading = cleanText(
      (
        headingModule.find("h1,h2,h3,h4").first().text() || headingModule.text()
      )?.replace(/^\/\//, ""),
    );
    const currentCategory = heading
      ? titleCase(heading.replace(/^\/\//, ""))
      : null;

    if (!currentCategory) {
      return;
    }

    const rows = $(table)
      .find("tr")
      .toArray()
      .map((row) =>
        $(row)
          .find("th,td")
          .toArray()
          .map((cell) => cleanText($(cell).text()) ?? ""),
      )
      .filter((cells) => cells.some(Boolean));
    const header = rows.find((cells) => /^ingredient$/i.test(cells[0] ?? ""));

    if (!header) {
      return;
    }

    const allergenColumns = header.map((cell, index) => ({
      allergens: cell.replace(/animal product/gi, "").trim()
        ? findAllergensInText(cell)
        : [],
      index,
    }));

    for (const cells of rows.slice(rows.indexOf(header) + 1)) {
      const rawName = cleanText(cells[0]?.replace(/^ingredient\b/i, ""));

      if (
        !rawName ||
        /^ingredient$/i.test(rawName) ||
        !isProbablyMenuItemName(rawName)
      ) {
        continue;
      }

      const canonical = andPizzaAllergenCanonicalRow(rawName, currentCategory);

      const allergens = [];

      for (const column of allergenColumns) {
        if (column.index === 0 || column.allergens.length === 0) {
          continue;
        }

        const cell = cells[column.index] ?? "";

        if (/\bR\b|✔|✓|●|yes|contains/i.test(cell)) {
          allergens.push(...column.allergens);
        }
      }

      const direct = uniqueStrings(allergens);

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens: direct,
          category: canonical.category,
          description: "Official &pizza allergen guide.",
          imageUrl: null,
          mayContain: [],
          name: canonical.name,
          sourceKind: "html-allergen-matrix",
          sourceUrl: url,
        }),
      );
    }
  });

  return records;
}

function andPizzaAllergenCanonicalRow(name, category) {
  const aliases = new Map([
    ["high protein salad", ["Protein Salad", "Salads"]],
    ["stuff crust add on traditional dough only", ["Stuffed Crust", "Pies"]],
    [
      "mango passionfruit canned soda",
      ["&SODA Mango Passion Fruit", "Beverages"],
    ],
    ["dark cherry cola canned soda", ["&SODA Dark Cherry Cola", "Beverages"]],
    [
      "gingerberry lemonade canned soda",
      ["&SODA Ginger Berry Lemonade", "Beverages"],
    ],
    ["sweet root beer canned soda", ["&SODA Sweet Root Beer", "Beverages"]],
    ["classic tomato", ["Tomato Sauce on the Side", "Side Sauces & Drizzles"]],
    ["spicy tomato", ["Spicy Tomato on the Side", "Side Sauces & Drizzles"]],
    ["barbecue", ["BBQ Sauce on the Side", "Side Sauces & Drizzles"]],
    ["basil pesto", ["Basil Pesto on the Side", "Side Sauces & Drizzles"]],
    ["buffalo", ["Buffalo Sauce on the Side", "Side Sauces & Drizzles"]],
    ["garlic butter", ["Garlic Butter on the Side", "Side Sauces & Drizzles"]],
    ["hot honey", ["Mike’s Hot Honey Dip Cup", "Side Sauces & Drizzles"]],
    ["balsamic fig", ["Fig Balsamic on the Side", "Side Sauces & Drizzles"]],
    ["ranch", ["Ranch on the Side", "Side Sauces & Drizzles"]],
  ]);
  const key = normalizeMenuName(name)
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const alias = aliases.get(key);

  return alias ? { name: alias[0], category: alias[1] } : { name, category };
}

function extractAndPizzaMenuItems($, restaurant, url) {
  const records = [];
  const publicMenuCategories = new Set([
    "Pies",
    "Extras",
    "Salads",
    "Desserts",
    "Beverages",
    "Side Sauces & Drizzles",
  ]);

  $(".menu_item_category_content").each((_rowIndex, row) => {
    const categoryRow = $(row).prevAll(".category_row").first();
    const rawCategory = cleanText(
      categoryRow.find("h1,h2,h3,h4").first().text() || categoryRow.text(),
    );
    const category = rawCategory ? titleCase(rawCategory) : null;

    if (!category || !publicMenuCategories.has(category)) {
      return;
    }

    $(row)
      .find(".dipi_price_list_item_wrapper")
      .each((_itemIndex, item) => {
        const name = cleanText(
          $(item).find(".dipi_price_list_title").first().text(),
        );
        const description = cleanText(
          $(item).find(".dipi_price_list_content").first().text(),
        );

        if (
          !name ||
          (!isProbablyMenuItemName(name) &&
            !/^@me don[’']t sub me$/i.test(name))
        ) {
          return;
        }

        records.push(
          createRecord({
            allergenSourceType: allergenSourceTypes.unavailable,
            allergens: [],
            category,
            description,
            imageUrl: null,
            mayContain: [],
            name,
            sourceKind: "html-menu",
            sourceUrl: url,
          }),
        );
      });
  });

  return uniqueBy(records, (record) => normalizeMenuName(record.name));
}

function extractJsonItemsFromHtml($, restaurant, url, kind = sourceTypes.menu) {
  const records = [];

  records.push(...extractPopmenuApolloStateItems($, restaurant, url, kind));

  $(
    "script[type='application/ld+json'], script#__NEXT_DATA__, script[type='application/json']",
  ).each((_index, element) => {
    const text = $(element).contents().text().trim();
    const parsed = parseJsonLoose(text);

    if (parsed) {
      records.push(
        ...extractRecordsFromObject(
          parsed,
          restaurant,
          url,
          "json-structured",
          kind,
        ),
      );
    }
  });

  $("script").each((_index, element) => {
    const text = $(element).contents().text();
    records.push(
      ...extractEmbeddedFlavorNutritionItems(text, restaurant, url, kind),
    );
    records.push(...extractSpotAppsNuxtMenuItems(text, restaurant, url, kind));
    records.push(...extractNextFlightProductItems(text, restaurant, url, kind));
    records.push(
      ...extractShopifyCollectionViewItems(text, restaurant, url, kind),
    );

    const jsonParsePattern = /JSON\.parse\("((?:\\.|[^"\\])*)"\)/g;
    let match;

    while ((match = jsonParsePattern.exec(text))) {
      const decoded = decodeJavaScriptString(match[1]);
      const parsed = parseJsonLoose(decodeHtml(decoded));

      if (parsed) {
        records.push(
          ...extractRecordsFromObject(
            parsed,
            restaurant,
            url,
            "json-structured",
            kind,
          ),
        );
      }
    }
  });

  return records;
}

function extractEmbeddedFlavorNutritionItems(
  scriptText,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (
    kind !== sourceTypes.allergen ||
    !/\bflavors\s*:\s*\{[\s\S]*?\bResult\b/.test(scriptText)
  ) {
    return [];
  }

  const marker = "flavors";
  const markerIndex = scriptText.indexOf(marker);
  const objectStart = scriptText.indexOf("{", markerIndex);

  if (objectStart < 0) {
    return [];
  }

  const objectEnd = findMatchingBracket(scriptText, objectStart, "{", "}");

  if (objectEnd < objectStart) {
    return [];
  }

  const parsed = parseJsonLoose(scriptText.slice(objectStart, objectEnd + 1));
  const flavors = asArray(parsed?.Result).filter(
    (flavor) => flavor && typeof flavor === "object",
  );

  return uniqueBy(
    flavors
      .map((flavor) => {
        const name = cleanText(
          pickString(flavor.FlavorName) ?? pickString(flavor.name),
        );
        const description = cleanText(
          pickString(flavor.Description) ??
            pickString(flavor.description) ??
            pickString(flavor.body),
        );
        const containsText =
          description?.match(/\bCONTAINS:\s*([^.]*)/i)?.[1] ?? "";
        const mayContainText =
          description?.match(/\bMAY CONTAIN(?: TRACES OF)?:\s*([^.]*)/i)?.[1] ??
          "";
        const direct = uniqueStrings([
          ...findAllergensInText(containsText),
          ...findDeclaredAllergensOnly(containsText),
        ]);
        const mayContain = uniqueStrings([
          ...findMayContainAllergens(mayContainText),
          ...findAllergensInText(mayContainText),
        ]);

        if (
          !name ||
          !isProbablyMenuItemName(name) ||
          (direct.length === 0 && mayContain.length === 0)
        ) {
          return null;
        }

        return createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens: direct,
          category:
            cleanText(pickString(flavor.ColdTreatType)) ?? restaurant.category,
          description: "Official embedded nutrition and allergen data.",
          evidenceText: description,
          imageUrl: pickImage(flavor.websiteimageUrl),
          ingredientsText: description,
          mayContain,
          name,
          sourceKind: "embedded-flavor-nutrition",
          sourceUrl: url,
          variantGroup: cleanText(pickString(flavor.ColdTreatType)),
        });
      })
      .filter(Boolean),
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );
}

function extractPopmenuApolloStateItems(
  $,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (kind === sourceTypes.allergen) {
    return [];
  }

  const records = [];

  $("script#popmenu-apollo-state").each((_index, element) => {
    const text = $(element).contents().text();
    const marker = "window.POPMENU_APOLLO_STATE";
    const markerIndex = text.indexOf(marker);

    if (markerIndex < 0) {
      return;
    }

    const start = text.indexOf("{", markerIndex);

    if (start < 0) {
      return;
    }

    const end = findMatchingBracket(text, start, "{", "}");

    if (end < start) {
      return;
    }

    const parsed = parseJsonLoose(
      sanitizePopmenuObjectLiteral(text.slice(start, end + 1)),
    );

    if (!parsed) {
      return;
    }

    records.push(...recordsFromPopmenuApolloState(parsed, restaurant, url));
  });

  return records;
}

function isPopmenuHtml(html) {
  return /(?:POPMENU_APOLLO_STATE|__POPMENU_SSR_CACHE__|popmenu_platform_brand)/i.test(
    html ?? "",
  );
}

function shouldStopPopmenuMenuDiscovery(url, html) {
  if (!isPopmenuHtml(html)) {
    return false;
  }

  try {
    return /^\/menus\//i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function sanitizePopmenuObjectLiteral(text) {
  return String(text).replace(/"\s*\+\s*"/g, "");
}

function recordsFromPopmenuApolloState(state, restaurant, url) {
  const records = [];

  for (const [key, item] of Object.entries(state)) {
    if (!key.startsWith("MenuItem:") || !item || typeof item !== "object") {
      continue;
    }

    if (item.isEnabled === false) {
      continue;
    }

    const menu = popmenuEntityForRef(state, item.menu);
    const section =
      popmenuEntityForRef(state, item.section) ??
      popmenuEntityForRef(state, item.menuSection);
    const dish =
      popmenuEntityForRef(state, item.dishable) ??
      popmenuEntityForRef(state, item.dish);
    const name = pickString(item.name) ?? pickString(dish?.name);
    const description =
      pickString(item.description) ??
      pickString(item.displayDescription) ??
      pickString(dish?.description) ??
      null;
    const imageUrl = absolutizeUrl(
      pickString(item.photoUrl) ??
        pickImage(item.photos) ??
        pickString(dish?.photoUrl) ??
        pickImage(dish?.photos),
      url,
    );

    if (
      !name ||
      !isProbablyMenuItemName(name) ||
      (!description && !imageUrl && !hasFoodLanguage(name))
    ) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.unavailable,
        allergens: [],
        category:
          pickString(section?.name) ??
          pickString(menu?.name) ??
          restaurant.category,
        description,
        imageUrl,
        mayContain: [],
        name,
        sourceKind: "popmenu-apollo-state",
        sourceUrl: absolutizeUrl(pickString(item.url), url) ?? url,
        variantGroup: pickString(menu?.name) ?? null,
      }),
    );
  }

  return records;
}

function popmenuEntityForRef(state, ref) {
  const key = pickString(ref?.__ref) ?? pickString(ref);
  return key ? state[key] : null;
}

function extractNextFlightProductItems(
  text,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (kind === sourceTypes.allergen || !text.includes("self.__next_f.push")) {
    return [];
  }

  const payloadStrings = [];
  const pushPattern = /self\.__next_f\.push\((\[.*\])\)\s*;?$/s;
  const match = pushPattern.exec(text.trim());

  if (!match) {
    return [];
  }

  try {
    collectStrings(JSON.parse(match[1]), payloadStrings);
  } catch {
    return [];
  }

  const records = [];

  for (const payload of payloadStrings) {
    if (
      !payload.includes('"product"') &&
      !payload.includes('"products"') &&
      !payload.includes("MenuPageItemList")
    ) {
      continue;
    }

    const categoryMap = extractNextFlightCategoryMap(payload);

    for (const products of extractNamedJsonObjects(payload, "products")) {
      for (const entry of Object.values(products)) {
        const product = entry?.product ?? entry;

        if (!product || typeof product !== "object" || Array.isArray(product)) {
          continue;
        }

        if (product.isAvailable === false || product.isDisabled === true) {
          continue;
        }

        const name =
          pickString(product.name) ??
          pickString(product.title) ??
          pickString(product.displayName) ??
          pickString(product.productName);
        const description =
          pickString(product.desc) ??
          pickString(product.description) ??
          pickString(product.shortDesc) ??
          pickString(product.shortDescription) ??
          null;
        const sourceUrl = absolutizeUrl(
          pickString(product.seoUrl)
            ? `/menu/${pickString(product.seoUrl)}`
            : null,
          url,
        );
        const category =
          categoryMap.get(pickString(product.categoryId)) ??
          firstMappedCategory(product.category, categoryMap) ??
          pickString(product.categoryName) ??
          pickString(product.category) ??
          inferCategoryFromUrl(sourceUrl ?? url) ??
          restaurant.category;
        const imageUrl = absolutizeUrl(
          pickImage(product.images) ??
            pickImage(product.image) ??
            pickString(product.imageUrl) ??
            pickString(product.thumbnailUrl),
          url,
        );

        if (
          !name ||
          !isProbablyMenuItemName(name) ||
          (!description && !imageUrl && !hasFoodLanguage(name))
        ) {
          continue;
        }

        const disclosure = getOfficialFoodDisclosure(product, kind);

        records.push(
          createRecord({
            allergenSourceType: disclosure.allergenSourceType,
            allergens: disclosure.directAllergens,
            category,
            description,
            imageUrl,
            ingredientsText: disclosure.ingredientsText,
            mayContain: disclosure.mayContain,
            name,
            nutritionFacts: nutritionFactsFromObject(product),
            sourceKind: "next-flight-products",
            sourceUrl: sourceUrl ?? url,
          }),
        );
      }
    }

    records.push(
      ...extractNextFlightMenuPageItemListRecords(
        payload,
        restaurant,
        url,
        kind,
      ),
    );
  }

  return records;
}

function extractNextFlightMenuPageItemListRecords(
  payload,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  const records = [];

  if (
    !payload.includes("MenuPageItemList") ||
    !payload.includes("MenuPageItem")
  ) {
    return records;
  }

  for (const categories of extractNamedJsonArrays(payload, "itemLists")) {
    records.push(
      ...recordsFromMenuPageItemLists(categories, restaurant, url, kind),
    );
  }

  for (const categories of extractNamedJsonArrays(payload, "itemListsList")) {
    records.push(
      ...recordsFromMenuPageItemLists(categories, restaurant, url, kind),
    );
  }

  for (const category of extractTypenameJsonObjects(
    payload,
    "MenuPageItemList",
  )) {
    records.push(
      ...recordsFromMenuPageItemLists([category], restaurant, url, kind),
    );
  }

  return records;
}

function recordsFromMenuPageItemLists(categories, restaurant, url, kind) {
  const records = [];

  for (const category of asArray(categories)) {
    const categoryName = pickString(category?.name) ?? restaurant.category;

    for (const item of asArray(category?.items)) {
      if (
        pickString(item?.__typename) &&
        pickString(item.__typename) !== "MenuPageItem"
      ) {
        continue;
      }

      const name = pickString(item?.name);
      const description = pickString(item?.description) ?? null;
      const imageUrl = absolutizeUrl(
        pickString(item?.imageUrl) ?? pickImage(item?.image),
        url,
      );

      if (
        !name ||
        !isProbablyMenuItemName(name) ||
        (!description && !imageUrl && !hasFoodLanguage(name))
      ) {
        continue;
      }

      const disclosure = getOfficialFoodDisclosure(item, kind);

      records.push(
        createRecord({
          allergenSourceType: disclosure.allergenSourceType,
          allergens: disclosure.directAllergens,
          category: categoryName,
          description,
          imageUrl,
          ingredientsText: disclosure.ingredientsText,
          mayContain: disclosure.mayContain,
          name,
          nutritionFacts: nutritionFactsFromObject(item),
          sourceKind: "next-flight-products",
          sourceUrl: url,
          variantGroup: pickString(category?.id) ?? categoryName,
        }),
      );
    }
  }

  return records;
}

function extractTypenameJsonObjects(text, typename) {
  const values = [];
  const marker = `"__typename":"${escapeRegExp(typename)}"`;
  let markerIndex = text.indexOf(marker);

  while (markerIndex >= 0) {
    const start = text.lastIndexOf("{", markerIndex);

    if (start < 0) {
      break;
    }

    const end = findMatchingBracket(text, start, "{", "}");

    if (end > markerIndex) {
      const parsed = parseJsonLoose(text.slice(start, end + 1));

      if (parsed) {
        values.push(parsed);
      }

      markerIndex = text.indexOf(marker, end + 1);
    } else {
      markerIndex = text.indexOf(marker, markerIndex + marker.length);
    }
  }

  return values;
}

function collectStrings(value, output) {
  if (typeof value === "string") {
    output.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectStrings(entry, output);
    }
  }
}

function extractNextFlightCategoryMap(payload) {
  const categoryMap = new Map();

  for (const key of ["categories", "Categories"]) {
    for (const categories of extractNamedJsonArrays(payload, key)) {
      for (const category of categories) {
        const id = pickString(category?.id) ?? pickString(category?.Id);
        const name = pickString(category?.name) ?? pickString(category?.Name);

        if (id && name) {
          categoryMap.set(id, name);
        }
      }
    }
  }

  return categoryMap;
}

function extractNamedJsonObjects(text, key) {
  return extractNamedJsonValues(text, key, "{", "}");
}

function extractNamedJsonArrays(text, key) {
  return extractNamedJsonValues(text, key, "[", "]");
}

function extractNamedJsonValues(text, key, openChar, closeChar) {
  const values = [];
  const pattern = new RegExp(
    `"${escapeRegExp(key)}"\\s*:\\s*\\${openChar}`,
    "g",
  );
  let match;

  while ((match = pattern.exec(text))) {
    const start = match.index + match[0].lastIndexOf(openChar);
    const end = findMatchingBracket(text, start, openChar, closeChar);

    if (end < 0) {
      continue;
    }

    const parsed = parseJsonLoose(text.slice(start, end + 1));

    if (parsed) {
      values.push(parsed);
    }

    pattern.lastIndex = end + 1;
  }

  return values;
}

function firstMappedCategory(categoryValue, categoryMap) {
  const categoryIds = Array.isArray(categoryValue)
    ? categoryValue
    : [categoryValue];

  for (const categoryId of categoryIds) {
    const category = categoryMap.get(pickString(categoryId));

    if (category) {
      return category;
    }
  }

  return null;
}

function extractShopifyCollectionViewItems(
  text,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (kind === sourceTypes.allergen || !text.includes("collectionView")) {
    return [];
  }

  const itemsStart = text.search(/\bcollectionView\s*:\s*\{/);

  if (itemsStart < 0) {
    return [];
  }

  const itemArrayStartMatch = /\bitems\s*:\s*\[/.exec(text.slice(itemsStart));

  if (!itemArrayStartMatch) {
    return [];
  }

  const arrayStart =
    itemsStart + itemArrayStartMatch.index + itemArrayStartMatch[0].length - 1;
  const arrayEnd = findMatchingBracket(text, arrayStart, "[", "]");

  if (arrayEnd < 0) {
    return [];
  }

  const arrayBody = text.slice(arrayStart + 1, arrayEnd);
  const itemObjects = splitTopLevelObjectLiterals(arrayBody);
  const records = [];

  for (const objectText of itemObjects) {
    const name = cleanMenuName(
      readJavaScriptObjectStringField(objectText, "name"),
    );
    const handle = readJavaScriptObjectStringField(objectText, "handle");
    const imagePath = readJavaScriptObjectStringField(objectText, "src");
    const category =
      readJavaScriptObjectStringField(objectText, "category") ??
      restaurant.category;

    if (!name || !isProbablyMenuItemName(name)) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.unavailable,
        allergens: [],
        category,
        description: null,
        imageUrl: absolutizeUrl(imagePath, url),
        mayContain: [],
        name,
        sourceKind: "shopify-collection-view",
        sourceUrl: handle ? absolutizeUrl(`/products/${handle}`, url) : url,
      }),
    );
  }

  return records;
}

function extractLeyeItemWrapMenuItems(
  $,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (kind === sourceTypes.allergen || !isLeyeMenuHtml($)) {
    return [];
  }

  const records = [];

  $(".item-wrap").each((_index, element) => {
    const item = $(element);
    const nameNode = item.find(".item-name").first().clone();
    nameNode.find("button, img, svg").remove();
    const name = cleanMenuName(nameNode.text());
    const description = cleanMenuDescription(
      item.find(".item-desc").first().text(),
    );
    const category = leyeCategoryForItem($, item) ?? restaurant.category;
    const imageUrl = absolutizeUrl(
      item
        .closest("div, article, section")
        .find("figure img, img")
        .first()
        .attr("src"),
      url,
    );

    if (
      !name ||
      !isProbablyMenuItemName(name) ||
      (!description && !imageUrl && !hasFoodLanguage(name))
    ) {
      return;
    }

    if (
      isLeyeBeverageCategory(category) ||
      /^(?:all items can be prepared gluten free|yes!|days)$/i.test(name) ||
      /\bhappy hour\b/i.test(`${name} ${category}`)
    ) {
      return;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.unavailable,
        allergens: [],
        category,
        description,
        imageUrl,
        mayContain: [],
        name,
        sourceKind: "leye-item-wrap",
        sourceUrl: url,
        variantGroup: leyeMenuNameForItem($, item),
      }),
    );
  });

  return records;
}

function isLeyeBeverageCategory(category) {
  return /^(?:beer|bi[eè]re|bottled|bottled beer|bottled & canned beer|coffee|coffee drinks|featured drinks|hard seltzer|hard seltzer & cider|hot tea|ros[ée]|sparkling|zero proof)$/i.test(
    cleanText(category) ?? "",
  );
}

function isLeyeMenuHtml($) {
  return (
    $(".item-wrap .item-name").length >= 8 &&
    /(?:themes\/lettuce|Lettuce Entertain You|LEYE-Logo|lettuce-cookies-notice)/i.test(
      $.html() ?? "",
    )
  );
}

function leyeCategoryForItem($, item) {
  const section = item.closest(".menu-section");
  const className = section.attr("class") ?? "";
  const fromClass = className
    .split(/\s+/)
    .filter((entry) => entry && entry !== "menu-section")
    .join(" ");

  return cleanText(
    fromClass
      .replace(/[-_]+/g, " ")
      .replace(/\b(?:single|sect|border)\b/gi, "")
      .replace(/\b(?:gf|vg|v)\b/gi, "")
      .trim(),
  );
}

function leyeMenuNameForItem($, item) {
  return cleanText(item.closest("article").children("h1,h2,h3").first().text());
}

function findMatchingBracket(text, openIndex, openChar, closeChar) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function splitTopLevelObjectLiterals(text) {
  const objects = [];
  let index = 0;

  while (index < text.length) {
    const start = text.indexOf("{", index);

    if (start < 0) {
      break;
    }

    const end = findMatchingBracket(text, start, "{", "}");

    if (end < 0) {
      break;
    }

    objects.push(text.slice(start, end + 1));
    index = end + 1;
  }

  return objects;
}

function readJavaScriptObjectStringField(objectText, fieldName) {
  const pattern = new RegExp(
    `${escapeRegExp(fieldName)}\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`,
  );
  const match = pattern.exec(objectText);

  return match ? cleanText(decodeJavaScriptString(match[1])) : null;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractRecordsFromObject(
  value,
  restaurant,
  url,
  sourceKind,
  kind = sourceTypes.menu,
  inheritedCategory = null,
) {
  const records = [];
  const stack = [{ forceMenuItem: false, inheritedCategory, value }];

  while (stack.length > 0) {
    const current = stack.pop();

    if (!current) {
      continue;
    }

    const node = current.value;

    if (Array.isArray(node)) {
      for (const item of node) {
        stack.push({
          forceMenuItem: current.forceMenuItem,
          inheritedCategory: current.inheritedCategory,
          value: item,
        });
      }

      continue;
    }

    if (!node || typeof node !== "object") {
      continue;
    }

    const schemaTypes = schemaTypesForNode(node);
    const isSchemaMenuItem =
      current.forceMenuItem || schemaTypes.some((type) => type === "menuitem");
    const isSchemaMenuSection = schemaTypes.some((type) =>
      /^(?:menusection|offercatalog)$/i.test(type),
    );
    const schemaSectionName = isSchemaMenuSection
      ? (pickString(node.name) ?? pickString(node.title))
      : null;
    const schemaSectionCategory =
      schemaSectionName && !/^(?:main\s+)?menu$/i.test(schemaSectionName)
        ? schemaSectionName
        : null;
    const nextCategory =
      schemaSectionCategory ??
      pickString(node.category) ??
      pickString(node.category_name) ??
      pickString(node.categoryName) ??
      pickString(node.menuCategory) ??
      pickString(node.section) ??
      pickString(node.groupName) ??
      pickString(node.collectionName) ??
      current.inheritedCategory;

    const name =
      pickString(node.name) ??
      pickString(node.title) ??
      pickString(node.displayName) ??
      pickString(node.productName) ??
      pickString(node.itemName) ??
      pickString(node.item_name);
    const description =
      pickString(node.description) ??
      pickString(node.item_description) ??
      pickString(node.itemDescription) ??
      pickString(node.shortDescription) ??
      pickString(node.longDescription) ??
      pickString(node.subtitle) ??
      null;
    const imageUrl = absolutizeUrl(
      pickImage(node.image) ??
        pickImage(node.images) ??
        pickString(node.imageUrl) ??
        pickString(node.imgLg) ??
        pickString(node.imgSm) ??
        pickString(node.imgBg) ??
        pickString(node.desktopImageUrl) ??
        pickString(node.mobileImageUrl),
      url,
    );
    const href = absolutizeUrl(
      pickString(node.url) ?? pickString(node.href) ?? pickString(node.link),
      url,
    );
    const disclosure = getOfficialFoodDisclosure(node, kind);

    if (
      name &&
      isProbablyMenuItemName(name) &&
      shouldEmitStructuredJsonRecord({
        isSchemaMenuItem,
        node,
        schemaTypes,
        sourceKind,
      }) &&
      !isRestaurantStructuredMetadataRecord(
        name,
        description,
        restaurant,
        url,
        sourceKind,
      ) &&
      hasStructuredRecordSubstance({
        description,
        disclosure,
        href,
        imageUrl,
        isSchemaMenuItem,
        sourceKind,
      })
    ) {
      records.push(
        createRecord({
          allergenSourceType: disclosure.allergenSourceType,
          allergens: disclosure.directAllergens,
          category:
            cleanText(nextCategory) ??
            inferCategoryFromUrl(href ?? url) ??
            restaurant.category,
          description,
          imageUrl,
          ingredientsText: disclosure.ingredientsText,
          mayContain: disclosure.mayContain,
          name,
          nutritionFacts: nutritionFactsFromObject(node),
          sourceKind,
          sourceUrl: href ?? url,
        }),
      );
    }

    for (const [key, child] of Object.entries(node)) {
      if (key === "__typename" || key === "@context") {
        continue;
      }

      stack.push({
        forceMenuItem:
          current.forceMenuItem || /^(?:hasMenuItem|itemOffered)$/i.test(key),
        inheritedCategory: nextCategory,
        value: child,
      });
    }
  }

  return records;
}

function hasStructuredRecordSubstance({
  description,
  disclosure,
  href,
  imageUrl,
  isSchemaMenuItem,
  sourceKind,
}) {
  if (
    description ||
    imageUrl ||
    disclosure.directAllergens.length > 0 ||
    isSchemaMenuItem
  ) {
    return true;
  }

  return Boolean(href) && sourceKind !== "json-structured";
}

function schemaTypesForNode(node) {
  const rawType = node?.["@type"];
  const values = Array.isArray(rawType) ? rawType : [rawType];

  return values
    .map((value) => cleanText(value))
    .filter(Boolean)
    .map((value) => value.toLowerCase().replace(/^schema:/, ""));
}

function shouldEmitStructuredJsonRecord({
  isSchemaMenuItem,
  node,
  schemaTypes,
  sourceKind,
}) {
  if (sourceKind !== "json-structured") {
    return true;
  }

  if (isSchemaMenuItem) {
    return true;
  }

  if (schemaTypes.length === 0) {
    return true;
  }

  return (
    !schemaTypes.some((type) =>
      /^(?:event|foodestablishment|imageobject|localbusiness|menu|menusection|offer|openinghoursspecification|organization|place|restaurant|webpage|website)$/i.test(
        type,
      ),
    ) &&
    !node?.hasMenuItem &&
    !node?.hasMenuSection
  );
}

function extractDomMenuItems($, restaurant, url, kind = sourceTypes.menu) {
  const items = [];
  const productLinks = [];
  const cardSelectors = [
    ".cmp-category__item",
    ".fdm-item-panel",
    "[class*='menu-item']",
    "[class*='MenuItem']",
    "[class*='product-card']",
    "[class*='ProductCard']",
    "[class*='productCard']",
    "[class*='ProductTile']",
    "[class*='menu-card']",
    "article",
  ];

  items.push(...extractEmbeddedUserItemsMenuItems($, restaurant, url, kind));
  items.push(...extractYextMenuItems($, restaurant, url, kind));
  items.push(...extractWixGalleryMenuItems($, restaurant, url, kind));
  const wixRichTextItems = extractWixRichTextMenuItems(
    $,
    restaurant,
    url,
    kind,
  );

  if (wixRichTextItems.length >= 8) {
    return {
      items: wixRichTextItems,
      productLinks,
    };
  }

  items.push(...wixRichTextItems);
  const leyeItems = extractLeyeItemWrapMenuItems($, restaurant, url, kind);

  if (leyeItems.length >= 10) {
    return {
      items: leyeItems,
      productLinks,
    };
  }

  items.push(...leyeItems);
  const webflowCmsItems = extractWebflowCmsMenuItems($, restaurant, url, kind);

  if (webflowCmsItems.length >= 10) {
    return {
      items: webflowCmsItems,
      productLinks,
    };
  }

  items.push(...webflowCmsItems);
  const squarespaceMenuBlockItems = extractSquarespaceMenuBlockItems(
    $,
    restaurant,
    url,
    kind,
  );

  if (squarespaceMenuBlockItems.length >= 10) {
    return {
      items: squarespaceMenuBlockItems,
      productLinks,
    };
  }

  items.push(...squarespaceMenuBlockItems);
  items.push(...extractSquarespaceTextBlockMenuItems($, restaurant, url, kind));
  const menuListItems = extractMenuListBlockItems($, restaurant, url, kind);

  if (menuListItems.length >= 10) {
    return {
      items: menuListItems,
      productLinks,
    };
  }

  items.push(...menuListItems);
  const laravelMenuProductItems = extractLaravelMenuProductItems(
    $,
    restaurant,
    url,
    kind,
  );

  if (laravelMenuProductItems.length >= 10) {
    return {
      items: [...items, ...laravelMenuProductItems],
      productLinks,
    };
  }

  items.push(...laravelMenuProductItems);
  const elementorMenuHeadingItems = extractElementorMenuHeadingItems(
    $,
    restaurant,
    url,
    kind,
  );

  if (elementorMenuHeadingItems.length >= 8) {
    return {
      items: [...items, ...elementorMenuHeadingItems],
      productLinks,
    };
  }

  items.push(...elementorMenuHeadingItems);
  items.push(...extractStructuredListMenuItems($, restaurant, url, kind));
  items.push(...extractSequentialParagraphMenuItems($, restaurant, url, kind));
  items.push(...extractInlineParagraphMenuItems($, restaurant, url, kind));
  items.push(...extractParagraphMenuLineItems($, restaurant, url, kind));
  const simpleItemCardItems = extractSimpleItemCardMenuItems(
    $,
    restaurant,
    url,
    kind,
  );

  if (simpleItemCardItems.length >= 10) {
    return {
      items: [...items, ...simpleItemCardItems],
      productLinks,
    };
  }

  items.push(...simpleItemCardItems);
  const sequentialPricedTextItems = extractSequentialPricedTextMenuItems(
    $,
    restaurant,
    url,
    kind,
  );

  if (sequentialPricedTextItems.length >= 10) {
    return {
      items: [...items, ...sequentialPricedTextItems],
      productLinks,
    };
  }

  items.push(...sequentialPricedTextItems);
  items.push(...extractHeadingMenuItems($, restaurant, url, kind));
  items.push(...extractClassicMenuBlockItems($, restaurant, url, kind));
  items.push(...extractFoodMenuPanelItems($, restaurant, url, kind));
  items.push(...extractSectionedImageMenuItems($, restaurant, url, kind));
  const weeblyCompactMenuItems = extractWeeblyCompactMenuItems(
    $,
    restaurant,
    url,
    kind,
  );

  if (weeblyCompactMenuItems.length >= 10) {
    return {
      items: weeblyCompactMenuItems,
      productLinks,
    };
  }

  items.push(...weeblyCompactMenuItems);

  $(cardSelectors.join(",")).each((_index, element) => {
    const $element = $(element);
    const name =
      cleanText(
        $element
          .find(
            "[class*='item-name'], [class*='product-name'], [class*='title'], h2, h3, h4, a",
          )
          .first()
          .text(),
      ) ?? cleanText($element.attr("aria-label"));

    if (!name || !isProbablyMenuItemName(name)) {
      return;
    }

    const rawHref =
      $element.find("a[href]").first().attr("href") ??
      $element.closest("a[href]").attr("href");
    const link = discardNonNavigableHref(rawHref)
      ? absolutizeUrl(rawHref, url)
      : null;
    const modalText = getLinkedDisclosureText($, $element);
    const description =
      cleanText(
        $element
          .find("[class*='description'], [class*='copy'], p")
          .first()
          .text(),
      ) ?? modalText;
    const imageUrl = absolutizeUrl(
      $element.find("img").first().attr("src") ??
        $element.find("img").first().attr("data-src") ??
        $element.find("source").first().attr("srcset")?.split(" ")[0],
      url,
    );
    const disclosure = getScopedDomDisclosure($element, kind);
    const textDisclosure = disclosureFromMenuText(
      cleanText(
        [cleanText($element.text()), modalText].filter(Boolean).join(" "),
      ),
      kind,
    );

    if (
      kind === sourceTypes.allergen &&
      disclosure.allergenSourceType === allergenSourceTypes.unavailable &&
      textDisclosure.allergenSourceType === allergenSourceTypes.unavailable
    ) {
      return;
    }

    const record = createRecord({
      allergenSourceType:
        disclosure.allergenSourceType !== allergenSourceTypes.unavailable
          ? disclosure.allergenSourceType
          : textDisclosure.allergenSourceType,
      allergens: uniqueStrings([
        ...disclosure.directAllergens,
        ...textDisclosure.directAllergens,
      ]),
      category: inferCategoryFromUrl(link ?? url) ?? restaurant.category,
      description,
      imageUrl,
      ingredientsText:
        disclosure.ingredientsText ??
        textDisclosure.ingredientsText ??
        modalText,
      mayContain: uniqueStrings([
        ...disclosure.mayContain,
        ...textDisclosure.mayContain,
      ]),
      name,
      sourceKind: "html-card",
      sourceUrl: link ?? url,
    });

    items.push(record);

    if (link && isLikelyProductHref(link)) {
      productLinks.push({ name, url: link });
    }
  });

  $("a[href]").each((_index, element) => {
    const $element = $(element);
    const name =
      cleanText($element.text()) ?? cleanText($element.attr("aria-label"));
    const href = absolutizeUrl($element.attr("href"), url);

    if (
      !href ||
      !name ||
      !isLikelyProductHref(href) ||
      !isProbablyMenuItemName(name)
    ) {
      return;
    }

    if (kind !== sourceTypes.allergen) {
      items.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.unavailable,
          allergens: [],
          category: inferCategoryFromUrl(href) ?? restaurant.category,
          description: null,
          imageUrl: absolutizeUrl(
            $element.find("img").first().attr("src") ??
              $element.find("img").first().attr("data-src"),
            url,
          ),
          mayContain: [],
          name,
          sourceKind: "html-link",
          sourceUrl: href,
        }),
      );
      productLinks.push({ name, url: href });
    }
  });

  return {
    items,
    productLinks,
  };
}

function extractSimpleItemCardMenuItems(
  $,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (kind === sourceTypes.allergen) {
    return [];
  }

  const records = [];

  $(".item-card").each((_index, element) => {
    const $item = $(element);

    if ($item.parents("nav, header, footer, form").length > 0) {
      return;
    }

    const $nameNode = $item.find(".item-name").first().clone();
    $nameNode.find(".item-price, [class*='price'], button, img, svg").remove();
    const name = cleanMenuName($nameNode.text());

    if (
      !name ||
      !isProbablyMenuItemName(name) ||
      !isAllowedSourceMenuName(restaurant, name)
    ) {
      return;
    }

    const description = cleanMenuDescription(
      $item.find(".item-desc").first().text(),
    );
    const rowText = cleanText($item.text()) ?? "";
    const category =
      simpleItemCardCategory($, $item) ??
      inferCategoryFromUrl(url) ??
      restaurant.category;

    if (!isAllowedSourceMenuCategory(restaurant, category)) {
      return;
    }

    if (!description && !hasFoodLanguage(name)) {
      return;
    }

    if (isProbablyMenuListBlockArtifact(name, description, category)) {
      return;
    }

    const disclosure = disclosureFromMenuText(rowText, kind);
    const scopedDisclosure = getScopedDomDisclosure($item, kind);

    records.push(
      createRecord({
        allergenSourceType:
          disclosure.allergenSourceType !== allergenSourceTypes.unavailable
            ? disclosure.allergenSourceType
            : scopedDisclosure.allergenSourceType,
        allergens: uniqueStrings([
          ...disclosure.directAllergens,
          ...scopedDisclosure.directAllergens,
        ]),
        category,
        description,
        imageUrl: absolutizeUrl(
          $item.find("img").first().attr("src") ??
            $item.find("img").first().attr("data-src") ??
            $item.find("source").first().attr("srcset")?.split(" ")[0],
          url,
        ),
        ingredientsText:
          scopedDisclosure.ingredientsText ??
          disclosure.ingredientsText ??
          description,
        mayContain: uniqueStrings([
          ...disclosure.mayContain,
          ...scopedDisclosure.mayContain,
        ]),
        name,
        sourceKind: "simple-item-card",
        sourceUrl: url,
        variantGroup: category,
      }),
    );
  });

  return uniqueBy(
    records,
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );
}

function simpleItemCardCategory($, $item) {
  const category =
    cleanText(
      $item
        .closest(".cat-section, [class*='category'], section")
        .find(".cat-heading, [class*='cat-heading'], h2, h3")
        .first()
        .text(),
    ) ??
    cleanText(
      $item
        .prevAll(".sub-heading, [class*='sub-heading'], h3, h4")
        .first()
        .text(),
    ) ??
    nearestPreviousCategory($, $item);

  return category ? titleCase(category.replace(/^\*+|\*+$/g, "").trim()) : null;
}

function extractSequentialPricedTextMenuItems(
  $,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (kind === sourceTypes.allergen) {
    return [];
  }

  const $scope = $("main, [role='main'], .main-content, .site-content, body")
    .first()
    .clone();

  if ($scope.length === 0) {
    return [];
  }

  $scope
    .find(
      "script, style, noscript, template, svg, nav, header, footer, form, aside",
    )
    .remove();
  $scope.find("br").replaceWith("\n");
  $scope
    .find("p, div, section, article, li, h1, h2, h3, h4, h5, h6, td, th")
    .append("\n");

  const text = $scope.text();
  const standalonePriceLines = text
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((line) => cleanText(line?.replace(/\t+/g, " ")))
    .filter(Boolean)
    .filter((line) => /^\$?\s*\d{1,3}(?:\.\d{2})?$/.test(line));

  if (standalonePriceLines.length < 4) {
    return [];
  }

  return extractGenericPdfMenuItems(text, restaurant, url)
    .map((record) => ({
      ...record,
      sourceKind: "html-sequential-priced-menu",
      sourceUrl: url,
    }))
    .filter((record) => isAllowedSourceMenuName(restaurant, record.name));
}

function extractSectionTitleMenuItemBlockItems(
  $,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (kind === sourceTypes.allergen) {
    return [];
  }

  const records = [];
  const headingSelector =
    "h1.section-title, h2.section-title, h3.section-title, h4.section-title, [class~='section-title']";

  $(headingSelector).each((_headingIndex, heading) => {
    const $heading = $(heading);

    if ($heading.parents("nav, header, footer, form").length > 0) {
      return;
    }

    const category = cleanText($heading.text());

    if (
      !category ||
      !isProbablyCategoryName(category) ||
      !isAllowedSourceMenuCategory(restaurant, category)
    ) {
      return;
    }

    const $scope = $heading.nextUntil(headingSelector);
    const $directItems = $scope.filter(".menu-item, [class*='menu-item']");
    const $nestedItems = $scope.find(".menu-item, [class*='menu-item']");
    const itemElements = uniqueBy(
      [...$directItems.toArray(), ...$nestedItems.toArray()],
      (element) => element,
    );

    for (const item of itemElements) {
      const $item = $(item);

      if (
        $item.parents("nav, header, footer, form").length > 0 ||
        /\bmenu-item-(?:type|object)\b/i.test($item.attr("class") ?? "")
      ) {
        continue;
      }

      const $textContainer = $item
        .find(".menu-item-text, [class*='menu-item-text']")
        .first();
      const $nameScope = $textContainer.length > 0 ? $textContainer : $item;
      const name = cleanMenuName(
        $nameScope
          .find(
            ".menu-item-title, [class*='menu-item-title'], [class*='item-title'], strong, b, h3, h4, h5",
          )
          .first()
          .text(),
      );

      if (
        !name ||
        !isProbablyMenuItemName(name) ||
        !isAllowedSourceMenuName(restaurant, name)
      ) {
        continue;
      }

      const $descriptionScope = (
        $textContainer.length > 0 ? $textContainer : $item
      ).clone();
      $descriptionScope
        .find(
          ".menu-item-title, [class*='menu-item-title'], [class*='item-title'], .menu-item-price, [class*='price'], strong, b, h3, h4, h5, button, img, svg",
        )
        .remove();

      const description = cleanMenuDescription($descriptionScope.text());
      const rowText = cleanText($item.text()) ?? "";

      if (!description && !hasFoodLanguage(name)) {
        continue;
      }

      if (isProbablyMenuListBlockArtifact(name, description, category)) {
        continue;
      }

      const disclosure = disclosureFromMenuText(rowText, kind);
      const scopedDisclosure = getScopedDomDisclosure($item, kind);

      records.push(
        createRecord({
          allergenSourceType:
            disclosure.allergenSourceType !== allergenSourceTypes.unavailable
              ? disclosure.allergenSourceType
              : scopedDisclosure.allergenSourceType,
          allergens: uniqueStrings([
            ...disclosure.directAllergens,
            ...scopedDisclosure.directAllergens,
          ]),
          category: titleCase(category),
          description,
          imageUrl: absolutizeUrl(
            $item.find("img").first().attr("src") ??
              $item.find("img").first().attr("data-src") ??
              $item.find("source").first().attr("srcset")?.split(" ")[0],
            url,
          ),
          ingredientsText: scopedDisclosure.ingredientsText ?? description,
          mayContain: uniqueStrings([
            ...disclosure.mayContain,
            ...scopedDisclosure.mayContain,
          ]),
          name,
          sourceKind: "html-section-title-menu-item",
          sourceUrl: url,
          variantGroup: titleCase(category),
        }),
      );
    }
  });

  const filtered = uniqueBy(
    records,
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );

  return filtered.length >= 4 ? filtered : [];
}

function extractDefinitionListMenuItems(
  $,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (kind === sourceTypes.allergen) {
    return [];
  }

  const records = [];

  $("dl").each((_listIndex, list) => {
    const $list = $(list);

    if ($list.parents("nav, header, footer, form").length > 0) {
      return;
    }

    const category =
      nearestPreviousCategory($, $list) ??
      inferCategoryFromUrl(url) ??
      restaurant.category;

    if (
      !category ||
      !isProbablyCategoryName(category) ||
      !isAllowedSourceMenuCategory(restaurant, category)
    ) {
      return;
    }

    $list.children("dt").each((_itemIndex, term) => {
      const $term = $(term);
      const name = cleanMenuName($term.text());

      if (
        !name ||
        !isProbablyMenuItemName(name) ||
        !isAllowedSourceMenuName(restaurant, name)
      ) {
        return;
      }

      const descriptionParts = [];
      let $next = $term.next();
      while ($next.length > 0 && $next[0]?.tagName?.toLowerCase() === "dd") {
        const part = cleanMenuDescription($next.text());
        if (part) {
          descriptionParts.push(part);
        }
        $next = $next.next();
      }

      const description = cleanMenuDescription(descriptionParts.join(" "));

      if (!description && !hasFoodLanguage(name)) {
        return;
      }

      if (isProbablyMenuListBlockArtifact(name, description, category)) {
        return;
      }

      const rowText = cleanText(`${name} ${description ?? ""}`) ?? "";
      const disclosure = disclosureFromMenuText(rowText, kind);

      records.push(
        createRecord({
          allergenSourceType: disclosure.allergenSourceType,
          allergens: disclosure.directAllergens,
          category: titleCase(category),
          description,
          ingredientsText: disclosure.ingredientsText ?? description,
          mayContain: disclosure.mayContain,
          name,
          sourceKind: "html-definition-list-menu-item",
          sourceUrl: url,
          variantGroup: titleCase(category),
        }),
      );
    });
  });

  const filtered = uniqueBy(
    records,
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );

  return filtered.length >= 4 ? filtered : [];
}

function extractMenuListBlockItems(
  $,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (kind === sourceTypes.allergen) {
    return [];
  }

  const records = [];

  $(".menu-list").each((_listIndex, list) => {
    const $list = $(list);

    if ($list.parents("nav, header, footer, form").length > 0) {
      return;
    }

    const category =
      nearestPreviousCategory($, $list) ??
      inferCategoryFromUrl(url) ??
      restaurant.category;

    const $titleNode = $list
      .find(".menu-list-title, [class*='menu-list-title']")
      .first()
      .clone();
    $titleNode
      .find(".menu-list-price, [class*='price'], svg, img, button")
      .remove();
    const directName = cleanMenuName($titleNode.text());
    const rowCandidates = directName
      ? [{ $item: $list, name: directName }]
      : $list
          .find(".menu-item, [class*='menu-item']")
          .toArray()
          .map((item) => {
            const $item = $(item);
            const $nameNode = $item
              .find(
                ".menu-item-subtitle, [class*='menu-item-subtitle'], h3, h4, h5",
              )
              .first()
              .clone();

            $nameNode
              .find(".menu-list-price, [class*='price'], svg, img, button")
              .remove();
            return { $item, name: cleanMenuName($nameNode.text()) };
          });

    for (const { $item, name } of rowCandidates) {
      if (!name || !isProbablyMenuItemName(name)) {
        continue;
      }

      const $detailsNode = $item
        .find(
          ".menu-item-details, [class*='menu-item-details'], [class*='description'], p",
        )
        .filter((_index, element) => {
          const text = cleanText($(element).text());
          return text && text !== name && text !== cleanText($titleNode.text());
        })
        .first()
        .clone();
      $detailsNode
        .find(".menu-list-price, [class*='price'], svg, img, button")
        .remove();
      const description = cleanMenuDescription($detailsNode.text());
      const imageUrl = absolutizeUrl(
        $item.find("img").first().attr("src") ??
          $item.find("img").first().attr("data-src") ??
          $item.find("source").first().attr("srcset")?.split(" ")[0],
        url,
      );

      if (!description && !imageUrl && !hasFoodLanguage(name)) {
        continue;
      }

      if (isProbablyMenuListBlockArtifact(name, description, category)) {
        continue;
      }

      const disclosure = getScopedDomDisclosure($item, kind);

      records.push(
        createRecord({
          allergenSourceType: disclosure.allergenSourceType,
          allergens: disclosure.directAllergens,
          category,
          description,
          imageUrl,
          ingredientsText: disclosure.ingredientsText ?? description,
          mayContain: disclosure.mayContain,
          name,
          sourceKind: "menu-list-block",
          sourceUrl: url,
          variantGroup: category,
        }),
      );
    }
  });

  return records;
}

function isProbablyMenuListBlockArtifact(name, description, category) {
  const nameText = cleanText(name) ?? "";
  const descriptionText = cleanText(description) ?? "";
  const categoryText = cleanText(category) ?? "";
  const text = `${nameText} ${descriptionText}`;
  const foodTerms =
    /\b(?:chicken|shrimp|fish|egg|cheese|beans?|rice|taco|burrito|sandwich|salad|bowl|soup|fries|chips|cake|cookie|muffin|bread|pasta|pizza|queso|guacamole|salsa|steak|pork|beef|salmon|avocado|tortilla|corn)\b/i;

  if (
    /\bopen daily:\s*\d/i.test(nameText) ||
    /\breservations?$/i.test(nameText)
  ) {
    return true;
  }

  if (
    /^(?:apple|cranberry|grapefruit|orange|pineapple|tomato)\s+juice(?:\s+box)?$/i.test(
      nameText,
    ) ||
    /^(?:canned soda|mexican soda|coke|diet coke|sprite|ginger ale|iced tea|lemonade|bottled water|sparkling water|club soda|tonic water)$/i.test(
      nameText,
    )
  ) {
    return true;
  }

  if (
    /\b(?:gin|mezcal|rum|tequila|vodka|whiskey|whisky|wine|ros[ée]|cabernet|chardonnay|pinot|sauvignon|riesling|prosecco|champagne|cava)\b/i.test(
      text,
    ) &&
    !foodTerms.test(text)
  ) {
    return true;
  }

  if (
    /^\s*ros\S*\s*\/\s*[a-z][a-z\s.-]*$/i.test(descriptionText) &&
    !foodTerms.test(nameText)
  ) {
    return true;
  }

  if (
    /\b(?:beverage|drink|soft drinks?|soda|juice|tea|coffee)\b/i.test(
      categoryText,
    ) &&
    !foodTerms.test(text)
  ) {
    return true;
  }

  return false;
}

function extractLaravelMenuProductItems(
  $,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (kind === sourceTypes.allergen) {
    return [];
  }

  const records = [];

  $(".single_product").each((_index, element) => {
    const $product = $(element);
    const name = cleanMenuName(
      $product
        .find(".menu_product_info h5, .title h5, h5, h4, h3")
        .first()
        .text(),
    );

    if (!name || !isProbablyMenuItemName(name)) {
      return;
    }

    const description = cleanMenuDescription(
      $product
        .find(".menu_product_info p, .card-body p, [class*='desc']")
        .filter((_i, entry) => cleanText($(entry).text()) !== name)
        .first()
        .text(),
    );
    const price = cleanText(
      $product
        .find(".price, [class*='price'], .menu_product_info span")
        .filter((_i, entry) => /\$?\d/.test($(entry).text()))
        .first()
        .text(),
    );
    const imageUrl = absolutizeUrl(
      $product.find("img").first().attr("src") ??
        $product.find("img").first().attr("data-src") ??
        $product.find("source").first().attr("srcset")?.split(" ")[0],
      url,
    );
    const category =
      laravelMenuProductCategory($, $product) ??
      inferCategoryFromUrl(url) ??
      restaurant.category;

    if (!description && !imageUrl && !price && !hasFoodLanguage(name)) {
      return;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.unavailable,
        allergens: [],
        category,
        description,
        imageUrl,
        ingredientsText: description,
        mayContain: [],
        name,
        sourceKind: "laravel-menu-product",
        sourceUrl: url,
        variantGroup: category,
      }),
    );
  });

  return records;
}

function laravelMenuProductCategory($, $product) {
  const paneId = $product.closest(".tab-pane, [id]").first().attr("id");
  const tabText = paneId
    ? cleanText(
        $(`[href="#${cssEscape(paneId)}"], #${cssEscape(paneId)}-tab`)
          .first()
          .text(),
      )
    : null;

  return tabText && isProbablyCategoryName(tabText) ? titleCase(tabText) : null;
}

function extractElementorMenuHeadingItems(
  $,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (kind === sourceTypes.allergen || $(".elementor").length === 0) {
    return [];
  }

  const scope = $(
    "main, [role='main'], .main-content, .site-content, article",
  ).first();
  const $scope = scope.length > 0 ? scope : $("body");
  const records = [];
  let currentCategory = restaurant.category;

  $scope.find(".elementor-heading-title").each((_index, element) => {
    const $heading = $(element);

    if ($heading.parents("nav, header, footer, form").length > 0) {
      return;
    }

    const tagName = String(element.tagName ?? "").toLowerCase();
    const text = cleanText($heading.text());

    if (!text) {
      return;
    }

    if (/^h[12]$/.test(tagName)) {
      if (isElementorMenuHeadingCategory(text)) {
        currentCategory = titleCase(text);
      }
      return;
    }

    if (!/^h[345]$/.test(tagName)) {
      return;
    }

    const name = cleanMenuName(text);
    const description = elementorHeadingDescription($, $heading);

    if (
      !name ||
      !isProbablyMenuItemName(name) ||
      isElementorMenuHeadingArtifact(name, description, currentCategory)
    ) {
      return;
    }

    if (
      !description &&
      !hasFoodLanguage(name) &&
      !isLikelyStandaloneDishHeading(name)
    ) {
      return;
    }

    const disclosure = disclosureFromMenuText(description ?? "", kind);

    records.push(
      createRecord({
        allergenSourceType: disclosure.allergenSourceType,
        allergens: disclosure.directAllergens,
        category: currentCategory,
        description,
        imageUrl: absolutizeUrl(
          $heading
            .closest(".elementor-element, .e-con, section, article")
            .find("img")
            .first()
            .attr("src") ??
            $heading
              .closest(".elementor-element, .e-con, section, article")
              .find("img")
              .first()
              .attr("data-src"),
          url,
        ),
        ingredientsText: disclosure.ingredientsText ?? description,
        mayContain: disclosure.mayContain,
        name,
        sourceKind: "elementor-menu-heading",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  });

  return records;
}

function elementorHeadingDescription($, $heading) {
  const $widget = $heading.closest(".elementor-element").first();
  const pieces = [];

  $widget
    .nextAll(".elementor-element")
    .slice(0, 3)
    .each((_index, sibling) => {
      const text = cleanMenuDescription($(sibling).text());

      if (
        text &&
        text.length <= 180 &&
        !isElementorMenuHeadingCategory(text) &&
        !/^(?:order catering|call to place your order|facebook|instagram|youtube)$/i.test(
          text,
        )
      ) {
        pieces.push(text);
      }
    });

  return cleanMenuDescription(uniqueStrings(pieces).join(" "));
}

function isElementorMenuHeadingCategory(text) {
  return /^(?:appetizers?|beverages?|breakfast|brunch|desserts?|dinner|favorite dishes|lunch|mains?|menu|our menu|salads?|sandwiches?|sides?)$/i.test(
    cleanText(text) ?? "",
  );
}

function isElementorMenuHeadingArtifact(name, description, category) {
  const text = `${name ?? ""} ${description ?? ""}`;

  if (
    /^(?:country club|chinola|jugos naturales|mango|tamarindo)$/i.test(
      name ?? "",
    )
  ) {
    return true;
  }

  if (/\bbeverages?\b/i.test(category ?? "")) {
    return true;
  }

  if (
    /\b(?:tropical drinks?|pop soda|passion fruit drink|tamarind drink|mango drink)\b/i.test(
      text,
    )
  ) {
    return true;
  }

  return false;
}

function isLikelyStandaloneDishHeading(name) {
  return /\b(?:bandera|chicharr[oó]n|chivo|empanadas?|mofongo|mondongo|pescado|picadera|pollo|res guisada)\b/i.test(
    name ?? "",
  );
}

function extractWebflowCmsMenuItems(
  $,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (kind === sourceTypes.allergen) {
    return [];
  }

  const records = [];

  $(".w-dyn-item").each((_index, element) => {
    const $item = $(element);

    if ($item.parents("nav, header, footer, form").length > 0) {
      return;
    }

    const name = cleanText(
      $item
        .find(
          ".item-heading, [class*='item-heading'], [class*='item-title'], [class*='dish-name'], h1, h2, h3, h4",
        )
        .first()
        .text(),
    );

    if (!name || !isProbablyMenuItemName(name)) {
      return;
    }

    const description =
      cleanText(
        $item
          .find(
            ".item-ingredients-paragraph, [class*='ingredient'], [class*='description'], [class*='desc'], p",
          )
          .filter((_i, entry) => cleanText($(entry).text()) !== name)
          .first()
          .text(),
      ) ?? null;
    const imageUrl = absolutizeUrl(
      $item.find("img").first().attr("src") ??
        $item.find("img").first().attr("data-src") ??
        $item.find("source").first().attr("srcset")?.split(" ")[0],
      url,
    );

    if (!description && !imageUrl && !hasFoodLanguage(name)) {
      return;
    }

    const category =
      nearestPreviousCategory($, $item) ??
      inferCategoryFromUrl(url) ??
      restaurant.category;
    const disclosure = getScopedDomDisclosure($item, kind);

    records.push(
      createRecord({
        allergenSourceType: disclosure.allergenSourceType,
        allergens: disclosure.directAllergens,
        category,
        description,
        imageUrl,
        ingredientsText: disclosure.ingredientsText ?? description,
        mayContain: disclosure.mayContain,
        name,
        sourceKind: "webflow-cms-menu",
        sourceUrl: url,
        variantGroup: category,
      }),
    );
  });

  return records;
}

function extractSectionedImageMenuItems(
  $,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (kind === sourceTypes.allergen) {
    return [];
  }

  const records = [];
  const scope = $(
    "main, [role='main'], .main-content, .site-content, body",
  ).first();
  const $scope = scope.length > 0 ? scope : $("body");

  $scope
    .find(
      "img[class*='item-image'], img[class*='menu-image'], img[class*='product-image']",
    )
    .each((_index, element) => {
      const $image = $(element);

      if ($image.parents("nav, header, footer, form").length > 0) {
        return;
      }

      const $card = $image
        .closest(
          "[class*='grid-item'], [class*='menu-item'], [class*='product-item'], article, li",
        )
        .first();
      const $source = $card.length > 0 ? $card : $image.parent();
      const name =
        cleanText(
          $source
            .find("h2, h3, h4, h5, [class*='item-name'], [class*='subheading']")
            .first()
            .text(),
        ) ?? cleanMenuName($image.attr("alt"));

      if (!name || !isProbablyMenuItemName(name)) {
        return;
      }

      const category =
        nearestPreviousCategory($, $source) ??
        inferCategoryFromUrl(url) ??
        restaurant.category;
      const description = sectionedImageMenuDescription($, $source, name);
      const imageUrl = absolutizeUrl(
        $image.attr("src") ??
          $image.attr("data-src") ??
          $image.attr("srcset")?.split(" ")[0],
        url,
      );

      if (!description && !imageUrl && !hasFoodLanguage(name)) {
        return;
      }

      const disclosure = getScopedDomDisclosure($source, kind);

      records.push(
        createRecord({
          allergenSourceType: disclosure.allergenSourceType,
          allergens: disclosure.directAllergens,
          category,
          description,
          imageUrl,
          ingredientsText: disclosure.ingredientsText,
          mayContain: disclosure.mayContain,
          name,
          sourceKind: "sectioned-image-menu",
          sourceUrl: url,
          variantGroup: category,
        }),
      );
    });

  return records;
}

function extractWeeblyCompactMenuItems(
  $,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (
    kind === sourceTypes.allergen ||
    !isWeeblyPage($) ||
    /bar-?menu|cocktails?/i.test(decodeUrlText(url))
  ) {
    return [];
  }

  const records = [];

  $("#wsite-content .paragraph").each((_index, element) => {
    const lines = weeblyParagraphLines($, $(element));

    if (lines.filter((line) => line.strong).length < 4) {
      return;
    }

    let currentCategory = inferCategoryFromUrl(url) ?? restaurant.category;
    let pending = null;

    for (const line of lines) {
      if (!line.text) {
        continue;
      }

      if (line.category && isProbablyCategoryName(line.text)) {
        flushPending();
        currentCategory = normalizeWeeblyMenuCategory(line.text);
        continue;
      }

      if (line.strong) {
        const pricedLine = parseGenericPdfMenuPricedLine(line.text);
        const name =
          pricedLine?.name ??
          (currentCategory === "Cheese Selection"
            ? cleanMenuName(line.text)
            : null);

        if (
          name &&
          isProbablyMenuItemName(name) &&
          !isGenericPdfMenuNonFoodName(name, null)
        ) {
          flushPending();
          pending = {
            category: currentCategory,
            descriptionLines: [],
            name,
            price: pricedLine?.price ?? null,
          };
        }
        continue;
      }

      if (pending && isGenericPdfMenuDescriptionLine(line.text)) {
        pending.descriptionLines.push(line.text);
      }
    }

    flushPending();

    function flushPending() {
      if (!pending) {
        return;
      }

      const name = cleanMenuName(pending.name);
      const description = cleanMenuDescription(
        pending.descriptionLines.join(" "),
      );

      if (
        name &&
        isProbablyMenuItemName(name) &&
        (description || pending.price || hasFoodLanguage(name)) &&
        normalizeMenuName(name) !== normalizeMenuName(restaurant.name)
      ) {
        const disclosure = disclosureFromMenuText(description ?? "", kind);

        records.push(
          createRecord({
            allergenSourceType: disclosure.allergenSourceType,
            allergens: disclosure.directAllergens,
            category: pending.category,
            description,
            imageUrl: null,
            ingredientsText: disclosure.ingredientsText ?? description,
            mayContain: disclosure.mayContain,
            name,
            sourceKind: "weebly-compact-menu",
            sourceUrl: url,
            variantGroup: pending.category,
          }),
        );
      }

      pending = null;
    }
  });

  return uniqueBy(
    records.filter((record) => isProbablyMenuCatalogRecord(record)),
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );
}

function isWeeblyPage($) {
  return (
    $("#wsite-content").length > 0 ||
    /editmysite|wsite/i.test(
      [
        $("meta[name='generator']").attr("content"),
        $("link[id='wsite-base-style']").attr("href"),
        $("script[src*='editmysite.com']").attr("src"),
      ]
        .filter(Boolean)
        .join(" "),
    )
  );
}

function normalizeWeeblyMenuCategory(value) {
  const category = cleanText(String(value ?? "").replace(/\u200b/g, ""));

  if (/^entr[ée]es?$/i.test(category ?? "")) {
    return "Entrées";
  }

  return titleCase(category);
}

function weeblyParagraphLines($, $paragraph) {
  const lines = [];
  let buffer = "";
  let strong = false;

  $paragraph.contents().each((_index, node) => visit(node));
  flush();

  return lines;

  function visit(node) {
    if (node.type === "text") {
      buffer += node.data ?? "";
      return;
    }

    if (node.type !== "tag") {
      return;
    }

    const $node = $(node);
    const tagName = String(node.name ?? "").toLowerCase();

    if (tagName === "br") {
      flush();
      return;
    }

    if (tagName === "font" && cleanText($node.attr("size")) === "5") {
      flush();
      const text = cleanText($node.text().replace(/\u200b/g, ""));

      if (text) {
        lines.push({ category: true, strong: false, text });
      }
      return;
    }

    if (tagName === "strong" || tagName === "b") {
      buffer += $node.text();
      strong = true;
      return;
    }

    $node.contents().each((_childIndex, child) => visit(child));
  }

  function flush() {
    const text = cleanText(buffer.replace(/\u200b/g, ""));

    if (text) {
      lines.push({ category: false, strong, text });
    }

    buffer = "";
    strong = false;
  }
}

function nearestPreviousCategory($, $element) {
  let $cursor = $element;

  for (let depth = 0; depth < 6 && $cursor.length > 0; depth += 1) {
    const heading = cleanText($cursor.prevAll("h1, h2, h3").first().text());

    if (heading && isProbablyCategoryName(heading)) {
      return titleCase(heading);
    }

    const parentHeading = cleanText(
      $cursor.parent().prevAll("h1, h2, h3").first().text(),
    );

    if (parentHeading && isProbablyCategoryName(parentHeading)) {
      return titleCase(parentHeading);
    }

    $cursor = $cursor.parent();
  }

  return null;
}

function sectionedImageMenuDescription($, $card, name) {
  const pieces = [];

  $card.find("p, div").each((_index, element) => {
    const text = cleanText($(element).text());

    if (
      !text ||
      text === name ||
      text.length > 360 ||
      /^(?:order now|view menu|find your location)$/i.test(text)
    ) {
      return;
    }

    pieces.push(text);
  });

  const uniquePieces = uniqueStrings(pieces).filter((piece) => piece !== name);
  const description = cleanText(uniquePieces.join(" "));

  return description && description !== name ? description : null;
}

function extractSquarespaceMenuBlockItems(
  $,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (kind === sourceTypes.allergen || !isSquarespacePage($)) {
    return [];
  }

  const records = [];

  $(".sqs-block-menu .menu-section, .menu-wrapper .menu-section").each(
    (_sectionIndex, section) => {
      const $section = $(section);

      if ($section.parents("nav, header, footer, form").length > 0) {
        return;
      }

      const category =
        cleanText($section.find(".menu-section-title").first().text()) ??
        nearestPreviousCategory($, $section) ??
        inferCategoryFromUrl(url) ??
        restaurant.category;

      $section.find(".menu-item").each((_itemIndex, item) => {
        const $item = $(item);
        const name = cleanMenuName(
          $item.find(".menu-item-title").first().text(),
        );
        const description = cleanMenuDescription(
          $item.find(".menu-item-description").first().text(),
        );

        if (!name || !isProbablyMenuItemName(name)) {
          return;
        }

        if (!description && !hasFoodLanguage(name)) {
          return;
        }

        if (isProbablyMenuListBlockArtifact(name, description, category)) {
          return;
        }

        const disclosure = disclosureFromMenuText(description ?? "", kind);

        records.push(
          createRecord({
            allergenSourceType: disclosure.allergenSourceType,
            allergens: disclosure.directAllergens,
            category,
            description,
            imageUrl: absolutizeUrl(
              $item.find("img").first().attr("src") ??
                $item.find("img").first().attr("data-src") ??
                $item.find("source").first().attr("srcset")?.split(" ")[0],
              url,
            ),
            ingredientsText: disclosure.ingredientsText ?? description,
            mayContain: disclosure.mayContain,
            name,
            sourceKind: "squarespace-menu-block",
            sourceUrl: url,
            variantGroup: category,
          }),
        );
      });
    },
  );

  return uniqueBy(
    records,
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );
}

function extractSquarespaceTextBlockMenuItems(
  $,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (kind === sourceTypes.allergen || !isSquarespacePage($)) {
    return [];
  }

  const records = [];
  const textBlocks = $(".sqs-html-content")
    .toArray()
    .map((element) => cleanText($(element).text()))
    .filter(Boolean);

  for (const blockText of textBlocks) {
    for (const name of splitSquarespaceMenuTextBlock(blockText)) {
      if (!isSquarespaceMenuTextName(name, restaurant)) {
        continue;
      }

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.unavailable,
          allergens: [],
          category: restaurant.category,
          description: null,
          imageUrl: null,
          mayContain: [],
          name,
          sourceKind: "html-card",
          sourceUrl: url,
        }),
      );
    }
  }

  return records;
}

function isSquarespacePage($) {
  return (
    $("html").text().includes("Static.SQUARESPACE_CONTEXT") ||
    $("body").hasClass("sqs-seven-one") ||
    $(".sqs-html-content").length >= 4
  );
}

function splitSquarespaceMenuTextBlock(text) {
  const cleaned = cleanText(text);

  if (!cleaned || cleaned.length > 120) {
    return [];
  }

  const normalized = cleaned
    .replace(/(SODA)(BOTTLED)/gi, "$1|$2")
    .replace(/(PEPPERONI)(BUFFALO CHICKEN)/gi, "$1|$2")
    .replace(/(GARLIC KNOTS)(CAESAR SALAD)(MEDITERRANEAN SALAD)/gi, "$1|$2|$3")
    .replace(/(COOKIE)(CHEESECAKE)/gi, "$1|$2");

  return normalized
    .split(/[|•]+/)
    .map((part) => cleanMenuName(part))
    .filter(Boolean);
}

function isSquarespaceMenuTextName(name, restaurant) {
  const cleaned = cleanMenuName(name);

  if (
    !cleaned ||
    cleaned.length < 4 ||
    cleaned.length > 70 ||
    !isProbablyMenuItemName(cleaned)
  ) {
    return false;
  }

  if (
    /^(?:drinks?|desserts?|salads?\s*&\s*sides?|wing flavor|dipping sauce|vegan|vegetarian|chicken|meat|specialty|single combo|double combo|by the slice|wiseguy\s*pies?|wiseguypies|oven roasted wings)$/i.test(
      cleaned,
    )
  ) {
    return false;
  }

  if (
    /^(?:careers?|contact|donations?|order online|rewards?|privacy policy|terms of service)$/i.test(
      cleaned,
    )
  ) {
    return false;
  }

  if (
    /^(?:\d+(?:\.\d{1,2})?|[$]?\d+(?:\.\d{1,2})?(?:\s*[-–]\s*[$]?\d+(?:\.\d{1,2})?)?)$/.test(
      cleaned,
    ) ||
    /\d+\.\d{2}.*\d+\.\d{2}/.test(cleaned) ||
    /^[\d\s().·-]*(?:pc|pcs|regular|raspberry|extra|marinara|sauce)[\d\s().·-]*$/i.test(
      cleaned,
    ) ||
    /^\d+\s*(?:pc|pcs)\s*\d/i.test(cleaned)
  ) {
    return false;
  }

  if (
    /\b(?:fountain soda|bottled soda|cane sugar soda|soda|beer|wine|cocktail)\b/i.test(
      cleaned,
    )
  ) {
    return false;
  }

  return (
    hasFoodLanguage(cleaned) ||
    /pizza|pepperoni|margherita|supreme|buffalo|truffle|paneer|bianca|stromboli|roller|knot|cookie|cheesecake|ranch|blue cheese/i.test(
      cleaned,
    ) ||
    /pizza/i.test(restaurant.category ?? "")
  );
}

function extractEmbeddedUserItemsMenuItems(
  $,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (kind === sourceTypes.allergen) {
    return [];
  }

  const records = [];

  $("[data-current-context]").each((_index, element) => {
    const rawContext = $(element).attr("data-current-context");
    const context = parseJsonLoose(decodeHtml(rawContext ?? ""));
    const userItems = Array.isArray(context?.userItems)
      ? context.userItems
      : [];

    for (const userItem of userItems) {
      const name = cleanMenuName(userItem?.title);
      const description = cleanMenuDescription(userItem?.description);

      if (!name || !isProbablyMenuItemName(name)) {
        continue;
      }

      if (!description && !hasFoodLanguage(name)) {
        continue;
      }

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.unavailable,
          allergens: [],
          category: restaurant.category,
          description,
          imageUrl: absolutizeUrl(
            userItem?.imageUrl ??
              userItem?.image?.url ??
              userItem?.image?.assetUrl ??
              userItem?.image?.originalSizeUrl,
            url,
          ),
          mayContain: [],
          name,
          sourceKind: "html-embedded-user-item",
          sourceUrl: url,
        }),
      );
    }
  });

  return records;
}

function extractYextMenuItems($, restaurant, url, kind = sourceTypes.menu) {
  const records = [];

  $(".yext-menu-item-details").each((_index, element) => {
    const $element = $(element);
    const name = cleanMenuName(
      $element.find(".yext-menu-item-name").first().text(),
    );
    const rawDescription = cleanText(
      $element.find(".yext-menu-item-desc").first().html(),
    );
    const description = cleanMenuDescription(rawDescription);

    if (!name || !isProbablyMenuItemName(name)) {
      return;
    }

    if (!description && !hasFoodLanguage(name)) {
      return;
    }

    const section =
      cleanText(
        $element
          .parents(".yext-menu-section, .yext-menu-category")
          .first()
          .find(".yext-menu-section-title, .yext-menu-category-name")
          .first()
          .text(),
      ) ??
      cleanText(
        $element
          .parents(".yext-menu")
          .first()
          .find(".yext-menu-section-title, .yext-menu-category-name")
          .first()
          .text(),
      );
    const disclosure = disclosureFromMenuText(description, kind);
    const imageUrl = absolutizeUrl(
      $element.find("img").first().attr("src") ??
        $element.find("img").first().attr("data-src"),
      url,
    );

    records.push(
      createRecord({
        allergenSourceType:
          disclosure.allergenSourceType !== allergenSourceTypes.unavailable
            ? disclosure.allergenSourceType
            : allergenSourceTypes.unavailable,
        allergens: disclosure.directAllergens,
        category: section ?? restaurant.category,
        description,
        imageUrl,
        ingredientsText: disclosure.ingredientsText,
        mayContain: disclosure.mayContain,
        name,
        sourceKind: "html-yext-menu-item",
        sourceUrl: url,
        variantGroup: section ?? restaurant.category,
      }),
    );
  });

  return records;
}

function extractWixGalleryMenuItems(
  $,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (kind === sourceTypes.allergen) {
    return [];
  }

  const records = [];

  $("[data-hook='item-link-wrapper']").each((_index, element) => {
    const $element = $(element);
    const name = cleanMenuName(
      $element.find("[data-hook='item-title']").first().text(),
    );
    const description = cleanMenuDescription(
      $element.find("[data-hook='item-description']").first().html(),
    );

    if (!name || !isProbablyMenuItemName(name)) {
      return;
    }

    if (!description && !hasFoodLanguage(name)) {
      return;
    }

    const section = cleanText(
      $element
        .parents("[data-hook='gallery-container'], section, main")
        .first()
        .find("h1, h2, h3, [data-hook='gallery-title']")
        .first()
        .text(),
    );
    const disclosure = disclosureFromMenuText(description, kind);

    records.push(
      createRecord({
        allergenSourceType: disclosure.allergenSourceType,
        allergens: disclosure.directAllergens,
        category: section ?? restaurant.category,
        description,
        imageUrl: absolutizeUrl(
          $element.find("img").first().attr("src") ??
            $element.find("img").first().attr("data-src"),
          url,
        ),
        ingredientsText: disclosure.ingredientsText,
        mayContain: disclosure.mayContain,
        name,
        sourceKind: "html-wix-gallery-item",
        sourceUrl: url,
        variantGroup: section ?? restaurant.category,
      }),
    );
  });

  return records;
}

function extractWixRichTextMenuItems(
  $,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (kind === sourceTypes.allergen || !isWixPage($)) {
    return [];
  }

  const records = [];
  let currentCategory = null;

  $(".wixui-rich-text, [data-testid='richTextElement']").each(
    (_index, element) => {
      const $element = $(element);
      const heading = cleanText(
        $element.children("h1, h2, h3, h4").first().text(),
      );

      if (heading && isWixRichTextMenuCategory(heading)) {
        currentCategory = heading;
        return;
      }

      const itemNames = $element
        .children("p")
        .toArray()
        .map((paragraph) => cleanMenuName($(paragraph).text()))
        .filter((name) => isWixRichTextMenuItemName(name, currentCategory));

      if (!currentCategory || itemNames.length === 0) {
        return;
      }

      for (const name of itemNames) {
        const disclosure = disclosureFromMenuText(name, kind);

        records.push(
          createRecord({
            allergenSourceType: disclosure.allergenSourceType,
            allergens: disclosure.directAllergens,
            category: currentCategory,
            description: null,
            imageUrl: null,
            ingredientsText: disclosure.ingredientsText,
            mayContain: disclosure.mayContain,
            name,
            sourceKind: "html-wix-rich-text-menu",
            sourceUrl: url,
            variantGroup: currentCategory,
          }),
        );
      }
    },
  );

  return uniqueBy(
    records,
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );
}

function isWixPage($) {
  return (
    /Wix\.com Website Builder/i.test(
      $("meta[name='generator']").attr("content") ?? "",
    ) ||
    $("html").html()?.includes("wixui-rich-text") ||
    $("html").html()?.includes("wixArtifactId:com.wixpress.restaurants")
  );
}

function isWixRichTextMenuCategory(text) {
  const cleaned = cleanMenuName(text);

  if (!cleaned || cleaned.length < 3 || cleaned.length > 40) {
    return false;
  }

  if (
    /^(?:menu|dinner special|lunch special|happy hour|subscribe|thanks|hungry|call ahead)$/i.test(
      cleaned,
    )
  ) {
    return false;
  }

  return (
    /^[A-Z0-9 '&/()-]+$/.test(cleaned) ||
    /\b(?:appetizers?|beef|pork|chicken|seafood|salads?|soups?|desserts?|sandwiches?|entrees?|pizza|pasta|sides?)\b/i.test(
      cleaned,
    )
  );
}

function isWixRichTextMenuItemName(name, category) {
  if (!category || !name || !isProbablyMenuItemName(name)) {
    return false;
  }

  if (/^\$?\d+(?:\.\d{2})?(?:\s*\/\s*person)?/i.test(name)) {
    return false;
  }

  if (
    /^(?:mon|tue|wed|thu|fri|sat|sun|tel|email|we'?re open|all rights reserved)\b/i.test(
      name,
    )
  ) {
    return false;
  }

  return (
    hasFoodLanguage(`${name} ${category}`) ||
    /\b(?:appetizers?|beef|pork|chicken|seafood|salads?|soups?|desserts?|sandwiches?|entrees?|pizza|pasta|sides?)\b/i.test(
      category,
    )
  );
}

function extractSequentialParagraphMenuItems(
  $,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (kind === sourceTypes.allergen) {
    return [];
  }

  const scope = $(
    "main, [role='main'], .main-content, .site-content, article, body",
  ).first();
  const $scope = scope.length > 0 ? scope : $("body");
  const records = [];
  let currentCategory = restaurant.category;
  const paragraphs = $scope
    .find("p")
    .filter(
      (_index, element) =>
        $(element).parents("nav, header, footer, form").length === 0,
    )
    .map((_index, element) => ({ element, text: cleanText($(element).text()) }))
    .get()
    .filter((entry) => entry.text);

  for (let index = 0; index < paragraphs.length - 1; index += 1) {
    const current = paragraphs[index];
    const next = paragraphs[index + 1];
    const heading = current.text.replace(/:$/, "");

    if (isLikelyDisclosureCategoryName(heading)) {
      currentCategory = titleCase(heading);
      continue;
    }

    if (!isSequentialMenuName(current.text, next.text)) {
      continue;
    }

    const name = cleanMenuName(current.text);
    const description = summarizePricedMenuDescription(next.text);

    if (
      !name ||
      !description ||
      name === description ||
      !isProbablyMenuItemName(name)
    ) {
      continue;
    }

    const disclosure = disclosureFromMenuText(description, kind);

    records.push(
      createRecord({
        allergenSourceType: disclosure.allergenSourceType,
        allergens: disclosure.directAllergens,
        category: currentCategory,
        description,
        imageUrl: null,
        ingredientsText: disclosure.ingredientsText,
        mayContain: disclosure.mayContain,
        name,
        sourceKind: "html-card",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );

    index += 1;
  }

  return records;
}

function isSequentialMenuName(nameText, descriptionText) {
  const name = cleanMenuName(nameText);
  const description = cleanText(descriptionText);

  if (!name || !description || name.length > 90 || description.length > 260) {
    return false;
  }

  if (paragraphMenuLineHasPrice(name) || isGenericInlineMenuNonItem(name)) {
    return false;
  }

  const descriptionLooksDetailed =
    paragraphMenuLineHasPrice(description) ||
    (/[,.|]/.test(description) && description.split(/\s+/).length >= 4);

  if (!descriptionLooksDetailed) {
    return false;
  }

  if (!hasFoodLanguage(`${name} ${description}`)) {
    return false;
  }

  return true;
}

function summarizePricedMenuDescription(text) {
  return cleanText(text)
    ?.replace(
      /\s*\|\s*\$?\d{1,4}(?:\.\d{2})?(?:\s*\/\s*\$?\d{1,4}(?:\.\d{2})?)*\s*$/i,
      "",
    )
    .replace(
      /\s+\$?\d{1,4}(?:\.\d{2})?(?:\s*\/\s*\$?\d{1,4}(?:\.\d{2})?)*\s*$/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function extractContainsDisclosureLineItems(
  $,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  const scope = $(
    "main, [role='main'], .main-content, .site-content, article",
  ).first();
  const $scope = scope.length > 0 ? scope : $("body");
  const records = [];
  let currentCategory = restaurant.category;

  const text = $scope
    .clone()
    .find("nav, header, footer, form, script, style, noscript")
    .remove()
    .end()
    .text()
    .replace(/\)\s+/g, ")\n");

  records.push(
    ...extractInlineContainsDisclosureItemsFromText(
      text,
      restaurant,
      url,
      kind,
      currentCategory,
    ),
  );

  for (const rawLine of text?.split(/\n|\r| {2,}/) ?? []) {
    const line = cleanText(rawLine);

    if (!line) {
      continue;
    }

    const heading = line.replace(/:$/, "");

    if (
      !/\bcontains?\b/i.test(line) &&
      isLikelyDisclosureCategoryName(heading)
    ) {
      currentCategory = titleCase(heading);
      continue;
    }

    const match = line.match(
      /^(.{2,120}?)\s*\((contains?\s+[^)]+)\)\s*(?:[-–—]\s*[A-Z]{1,4})?$/i,
    );

    if (!match) {
      continue;
    }

    const name = cleanMenuName(match[1]);
    const disclosureText = cleanText(match[2]);

    if (!name || !disclosureText || !isProbablyMenuItemName(name)) {
      continue;
    }

    const disclosure = disclosureFromMenuText(disclosureText, kind);

    records.push(
      createRecord({
        allergenSourceType:
          kind === sourceTypes.allergen
            ? allergenSourceTypes.officialAllergenMenu
            : allergenSourceTypes.officialProductAllergenSection,
        allergens: disclosure.directAllergens,
        category: currentCategory,
        description: disclosureText,
        imageUrl: null,
        ingredientsText: null,
        mayContain: disclosure.mayContain,
        name,
        sourceKind: "html-card",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(
    records,
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );
}

function extractOfficialNarrativeAllergenHtmlItems(
  $,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (kind !== sourceTypes.allergen) {
    return [];
  }

  const text = cleanText(
    $("body")
      .clone()
      .find("nav, header, footer, form, script, style, noscript")
      .remove()
      .end()
      .text(),
  );
  const records = [];

  if (!text) {
    return records;
  }

  for (const match of text.matchAll(
    /(?:^|[.;]\s+|:\s+)([A-Z][A-Za-z0-9&'’/ -]{2,80}?)\s+contains?\s+([^.;]{1,140})/g,
  )) {
    const name = cleanMenuName(match[1]);
    const disclosureText = cleanText(`Contains ${match[2]}`);
    const allergens = findDeclaredAllergensOnly(disclosureText);

    if (!name || allergens.length === 0 || !isProbablyMenuItemName(name)) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: restaurant.category,
        description: disclosureText,
        evidenceText: `${name} ${disclosureText}`,
        imageUrl: null,
        ingredientsText: null,
        mayContain: [],
        name,
        sourceKind: "html-allergen-narrative",
        sourceUrl: url,
        variantGroup: restaurant.category,
      }),
    );
  }

  for (const match of text.matchAll(
    /([A-Z][A-Za-z0-9&'’/ -]{2,80}?)\b[^.;]{0,160}\bmay contain\s+([^.;]{1,120})/g,
  )) {
    const name = cleanMenuName(match[1]);
    const mayContain = findAllergensInText(match[2]);

    if (!name || mayContain.length === 0 || !isProbablyMenuItemName(name)) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens: [],
        category: restaurant.category,
        description: cleanText(`May contain ${match[2]}`),
        evidenceText: cleanText(match[0]),
        imageUrl: null,
        ingredientsText: null,
        mayContain,
        name,
        sourceKind: "html-allergen-narrative",
        sourceUrl: url,
        variantGroup: restaurant.category,
      }),
    );
  }

  const soyCategoryMatch = text.match(
    /\bSoy\s*\/\s*Soybean Oil:[^.]*?\bincluding(?: but not limited to)?\s+([^.;]+)/i,
  );

  if (soyCategoryMatch) {
    for (const name of splitNarrativeItemList(soyCategoryMatch[1])) {
      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens: ["soy"],
          category: restaurant.category,
          description:
            "Official allergen page lists soy or soybean oil in this menu group.",
          evidenceText: cleanText(soyCategoryMatch[0]),
          imageUrl: null,
          ingredientsText: null,
          mayContain: [],
          name,
          sourceKind: "html-allergen-narrative",
          sourceUrl: url,
          variantGroup: restaurant.category,
        }),
      );
    }
  }

  const glutenFriedMatch = text.match(
    /\bfried menu items that contain gluten\s*\(([^)]+)\)/i,
  );

  if (glutenFriedMatch) {
    for (const name of splitNarrativeItemList(glutenFriedMatch[1])) {
      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens: ["wheat", "gluten"],
          category: restaurant.category,
          description:
            "Official allergen page lists this fried item group as containing gluten.",
          evidenceText: cleanText(glutenFriedMatch[0]),
          imageUrl: null,
          ingredientsText: null,
          mayContain: [],
          name,
          sourceKind: "html-allergen-narrative",
          sourceUrl: url,
          variantGroup: restaurant.category,
        }),
      );
    }
  }

  for (const statement of extractNamedIngredientStatements(text)) {
    const allergens = findAllergensInText(statement.ingredientsText);

    if (allergens.length === 0) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialIngredients,
        allergens,
        category: restaurant.category,
        description: "Official ingredient statement.",
        evidenceText: `${statement.name}: ${statement.ingredientsText}`,
        imageUrl: null,
        ingredientsText: statement.ingredientsText,
        mayContain: findMayContainAllergens(statement.ingredientsText),
        name: statement.name,
        sourceKind: "html-allergen-narrative",
        sourceUrl: url,
        variantGroup: restaurant.category,
      }),
    );
  }

  return uniqueBy(
    records.filter(
      (record) => record.name && isProbablyMenuItemName(record.name),
    ),
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );
}

function splitNarrativeItemList(value) {
  return uniqueStrings(
    String(value ?? "")
      .replace(/\bour\b/gi, "")
      .split(/\s*,\s*|\s+and\s+|\s*\/\s*/)
      .map((item) => cleanMenuName(item))
      .filter(
        (item) =>
          item && item.length >= 3 && !/^(?:items?|menu|various)$/i.test(item),
      ),
  );
}

function extractNamedIngredientStatements(text) {
  const names = [
    "baddpizza Dough",
    "Gluten-Free Cauliflower Crust",
    "Pizza Sauce",
    "Mozzarella Cheese",
    "Cup & Char Pepperoni",
    "Meatballs",
    "Sausage",
  ];
  const positions = names
    .map((name) => ({ index: text.indexOf(name), name }))
    .filter((entry) => entry.index >= 0)
    .sort((left, right) => left.index - right.index);
  const statements = [];

  for (let index = 0; index < positions.length; index += 1) {
    const current = positions[index];
    const next = positions[index + 1];
    const start = current.index + current.name.length;
    const end = next?.index ?? text.length;
    const ingredientsText = cleanText(text.slice(start, end));

    if (ingredientsText) {
      statements.push({
        ingredientsText,
        name: current.name,
      });
    }
  }

  return statements;
}

function extractInlineContainsDisclosureItemsFromText(
  text,
  restaurant,
  url,
  kind,
  fallbackCategory,
) {
  const flattened = cleanText(text);
  const records = [];

  if (!flattened || !/\bcontains?\b/i.test(flattened)) {
    return records;
  }

  for (const match of flattened.matchAll(/\bcontains?\s+([^.;|]{1,120})/gi)) {
    const disclosureText = cleanText(match[0]);
    const disclosure = disclosureFromMenuText(disclosureText, kind);

    if (
      !disclosureText ||
      disclosure.allergenSourceType === allergenSourceTypes.unavailable ||
      match.index === undefined
    ) {
      continue;
    }

    const before = flattened.slice(Math.max(0, match.index - 320), match.index);
    const name = menuItemNameBeforeContainsDisclosure(before);

    if (!name) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: disclosure.allergenSourceType,
        allergens: disclosure.directAllergens,
        category: fallbackCategory,
        description: disclosureText,
        imageUrl: null,
        ingredientsText: null,
        mayContain: disclosure.mayContain,
        name,
        sourceKind: "html-card",
        sourceUrl: url,
        variantGroup: fallbackCategory,
      }),
    );
  }

  return records;
}

function menuItemNameBeforeContainsDisclosure(text) {
  const candidates = [
    ...String(text ?? "").matchAll(
      /(?:^|[.!?]\s+|\s{2,})([A-Z][A-Za-z0-9&'’" -]{2,80}?)\s+\d{1,3}(?:\.\d{2})?(?=\s)/g,
    ),
    ...String(text ?? "").matchAll(
      /([A-Z][A-Za-z0-9&'’" -]{2,80}?)\s+\d{1,3}(?:\.\d{2})?(?=\s)/g,
    ),
  ];
  const last = candidates.at(-1)?.[1];
  const name = cleanMenuName(last);

  return name && isProbablyMenuItemName(name) ? name : null;
}

function discardNonNavigableHref(href) {
  if (!href || /^(?:javascript|mailto|tel):?/i.test(href)) {
    return null;
  }

  return href;
}

function isLikelyDisclosureCategoryName(name) {
  const cleaned = cleanText(name)?.replace(/:$/, "");

  if (!cleaned || !isProbablyCategoryName(cleaned)) {
    return false;
  }

  return /^(?:allergen guide|bakery|breakfast|burgers?|desserts?|drinks?|food|gelato|ice cream|kids|menu|salads?|sandwiches|sides?|specials|toppings(?: & add-ons)?|treats|vegan(?: ice cream)?|sorbetto?)$/i.test(
    cleaned,
  );
}

function getLinkedDisclosureText($, $element) {
  const modalId = cleanText(
    $element
      .find("[data-reveal-id], [data-modal], [data-target]")
      .first()
      .attr("data-reveal-id") ??
      $element
        .find("[data-reveal-id], [data-modal], [data-target]")
        .first()
        .attr("data-modal") ??
      $element
        .find("[data-reveal-id], [data-modal], [data-target]")
        .first()
        .attr("data-target") ??
      $element.attr("data-reveal-id") ??
      $element.attr("data-modal") ??
      $element.attr("data-target"),
  )?.replace(/^#/, "");

  if (!modalId) {
    return null;
  }

  const $modal = $(`#${cssEscape(modalId)}`);

  if ($modal.length === 0) {
    return null;
  }

  const candidates = [
    ...$modal
      .find("img[alt]")
      .map((_index, image) => cleanText($(image).attr("alt")))
      .get(),
    cleanText(
      $modal
        .clone()
        .find("button, a, script, style, noscript")
        .remove()
        .end()
        .text(),
    ),
  ].filter(Boolean);

  return candidates
    .filter(isUsefulDisclosureText)
    .reduce(pickBestDescription, null);
}

function cssEscape(value) {
  return String(value).replace(
    /([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g,
    "\\$1",
  );
}

function isUsefulDisclosureText(text) {
  const cleaned = cleanText(text);

  if (!cleaned || cleaned.length < 16) {
    return false;
  }

  return /\b(?:contains?|may contain|ingredients?|milk|cream|egg|wheat|soy|peanut|tree nut|sesame|fish|shellfish)\b/i.test(
    cleaned,
  );
}

function extractInlineParagraphMenuItems(
  $,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (kind === sourceTypes.allergen) {
    return [];
  }

  const scope = $(
    "main, [role='main'], .main-content, .site-content, article",
  ).first();
  const $scope = scope.length > 0 ? scope : $("body");
  const records = [];
  let currentCategory = restaurant.category;

  $scope.find("h2, h3, h4, h5, p").each((_index, element) => {
    const $element = $(element);
    const tagName = element.tagName?.toLowerCase();

    if ($element.parents("nav, header, footer, form").length > 0) {
      return;
    }

    if (/^h[2-5]$/.test(tagName ?? "")) {
      const heading = cleanText($element.text());

      if (heading && isProbablyCategoryName(heading)) {
        currentCategory = titleCase(heading);
      }

      return;
    }

    if (tagName !== "p") {
      return;
    }

    const parsed = parseInlineParagraphMenuItem($, $element);

    if (!parsed || !isProbablyMenuItemName(parsed.name)) {
      return;
    }

    if (!parsed.description && !hasFoodLanguage(parsed.name)) {
      return;
    }

    if (!hasFoodLanguage(`${parsed.name} ${parsed.description ?? ""}`)) {
      return;
    }

    const disclosure = getScopedDomDisclosure($element, kind);

    records.push(
      createRecord({
        allergenSourceType: disclosure.allergenSourceType,
        allergens: disclosure.directAllergens,
        category: currentCategory,
        description: parsed.description,
        imageUrl: null,
        ingredientsText: disclosure.ingredientsText,
        mayContain: disclosure.mayContain,
        name: parsed.name,
        sourceKind: "html-card",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  });

  return records;
}

function parseInlineParagraphMenuItem($, $element) {
  const fullText = cleanText($element.text());

  if (!fullText || isGenericInlineMenuNonItem(fullText)) {
    return null;
  }

  const emphasis = cleanText($element.find("em").first().text());

  if (emphasis) {
    const clone = $element.clone();
    clone.find("em").remove();
    const name = cleanInlineMenuItemName(clone.text());
    const description = summarizeIngredientText(emphasis);

    if (name && description && name !== description) {
      return { description, name };
    }
  }

  const strong = $element.find("strong, b").first();
  const strongText = cleanText(strong.text());

  if (strongText) {
    const clone = $element.clone();
    clone.find("strong, b").first().remove();
    let description = summarizeIngredientText(
      cleanText(clone.text())
        ?.replace(/^[-–—:|,/]+/, "")
        .replace(/\s+/g, " "),
    );
    const name = cleanInlineMenuItemName(strongText);

    if (/^\$?\d{1,4}(?:\.\d{2})?$/.test(description ?? "")) {
      description = null;
    }

    if (!description) {
      const nextParagraph = $element.nextAll("p").first();
      const nextText = cleanText(nextParagraph.text());

      if (
        nextText &&
        nextParagraph.find("strong, b").length === 0 &&
        !isGenericInlineMenuNonItem(nextText)
      ) {
        description = summarizeIngredientText(nextText);
      }
    }

    if (name && description && name !== description) {
      return { description, name };
    }
  }

  return null;
}

function cleanInlineMenuItemName(value) {
  const cleaned = cleanMenuName(value)
    ?.replace(
      /\s*\|\s*\$?\d{1,4}(?:\.\d{2})?(?:\s*(?:additional|per person|pp|\/).*)?$/i,
      "",
    )
    ?.replace(
      /\s*\$?\d{1,4}(?:\.\d{2})?(?:\s*(?:additional|per person|pp|\/).*)?$/i,
      "",
    )
    .replace(/\s*[~+^*]+$/g, "")
    .replace(
      /\s*\((?:gf|df|v|v\+|cn|sf)(?:,\s*(?:gf|df|v|v\+|cn|sf))*\)\s*$/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.length > 96 || isGenericInlineMenuNonItem(cleaned)) {
    return null;
  }

  return cleaned;
}

function isGenericInlineMenuNonItem(text) {
  return /^(?:add\b|choice of:?|available|optional supplement|supper club|wine pairing|everyone'?s appetite|for allergy|yuan tang|corey jamison|tori pajak|\$?\d+\s*(?:per person|pp)|please notify|consuming raw|we kindly ask|our current menu|the tawle experience|our freshly baked|book|reserve|menu)$/i.test(
    cleanText(text) ?? "",
  );
}

function extractClassicMenuBlockItems(
  $,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (kind === sourceTypes.allergen) {
    return [];
  }

  const records = [];

  $(".menu_block, [class*='menu-block'], [class*='menuBlock']").each(
    (_blockIndex, block) => {
      const $block = $(block);

      if ($block.parents("nav, header, footer, form").length > 0) {
        return;
      }

      const category = cleanText(
        $block
          .find("h1, h2, h3, [class*='section-title'], [class*='category']")
          .first()
          .text(),
      );
      const fallbackDescription = cleanText(
        $block.children("p").first().text(),
      );

      $block
        .find(".item-inner, [class*='item-inner'], [class*='menu-row']")
        .each((_rowIndex, row) => {
          const $row = $(row);
          const name = cleanMenuName(
            $row
              .find(
                ".menu-item, [class*='menu-item-name'], [class*='item-name']",
              )
              .first()
              .text(),
          );

          if (!name || !isProbablyMenuItemName(name)) {
            return;
          }

          const rowText = cleanText($row.text());
          const description = cleanText(
            $row
              .find("[class*='description'], [class*='desc'], p")
              .first()
              .text(),
          );
          const disclosure = disclosureFromMenuText(rowText, kind);
          const scopedDisclosure = getScopedDomDisclosure($row, kind);

          records.push(
            createRecord({
              allergenSourceType:
                disclosure.allergenSourceType !==
                allergenSourceTypes.unavailable
                  ? disclosure.allergenSourceType
                  : scopedDisclosure.allergenSourceType,
              allergens: uniqueStrings([
                ...disclosure.directAllergens,
                ...scopedDisclosure.directAllergens,
              ]),
              category:
                category && isProbablyCategoryName(category)
                  ? titleCase(category)
                  : restaurant.category,
              description: description ?? fallbackDescription,
              imageUrl: absolutizeUrl(
                $row.find("img").first().attr("src") ??
                  $row.find("img").first().attr("data-src"),
                url,
              ),
              ingredientsText: scopedDisclosure.ingredientsText,
              mayContain: uniqueStrings([
                ...disclosure.mayContain,
                ...scopedDisclosure.mayContain,
              ]),
              name,
              sourceKind: "html-card",
              sourceUrl: url,
              variantGroup:
                category && isProbablyCategoryName(category)
                  ? titleCase(category)
                  : null,
            }),
          );
        });
    },
  );

  return records;
}

function extractFoodMenuPanelItems(
  $,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  const records = [];

  $(
    ".fdm-item-panel, .food-item-holder, .list-column, [class*='food-menu-item'], [class*='FoodMenuItem']",
  ).each((_index, element) => {
    const $element = $(element);

    if ($element.parents("nav, header, footer, form").length > 0) {
      return;
    }

    const name = cleanMenuName(
      $element
        .find(
          ".fdm-item-title, [class*='item-title'], [class*='ItemTitle'], h3, h4",
        )
        .add(
          $element.find(".food-item-title h3, .list-column__headline").first(),
        )
        .first()
        .text(),
    );

    const description = cleanFoodMenuPanelDescription($, $element, name);

    if (!name || !isProbablyFoodMenuPanelName(name, description)) {
      return;
    }

    if (!description && !hasFoodLanguage(name)) {
      return;
    }

    const category = cleanText(
      $element
        .closest(
          ".fdm-section, [class*='menu-section'], [class*='MenuSection'], .module, section",
        )
        .find(
          ".fdm-section-header h2, .fdm-section-header h3, .fdm-section-title, h2, h3, h4, h5",
        )
        .first()
        .text(),
    );
    const disclosure = disclosureFromMenuText(description, kind);
    const scopedDisclosure = getScopedDomDisclosure($element, kind);

    records.push(
      createRecord({
        allergenSourceType:
          disclosure.allergenSourceType !== allergenSourceTypes.unavailable
            ? disclosure.allergenSourceType
            : scopedDisclosure.allergenSourceType,
        allergens: uniqueStrings([
          ...disclosure.directAllergens,
          ...scopedDisclosure.directAllergens,
        ]),
        category:
          category && isProbablyCategoryName(category)
            ? titleCase(category)
            : restaurant.category,
        description,
        imageUrl: absolutizeUrl(
          $element.find("img").first().attr("src") ??
            $element.find("img").first().attr("data-src"),
          url,
        ),
        ingredientsText: scopedDisclosure.ingredientsText,
        mayContain: uniqueStrings([
          ...disclosure.mayContain,
          ...scopedDisclosure.mayContain,
        ]),
        name,
        sourceKind: "html-card",
        sourceUrl: url,
        variantGroup:
          category && isProbablyCategoryName(category)
            ? titleCase(category)
            : null,
      }),
    );
  });

  return records;
}

function isProbablyFoodMenuPanelName(name, description) {
  if (isProbablyMenuItemName(name)) {
    return true;
  }

  return /^\d{2,4}$/.test(name) && hasFoodLanguage(description);
}

function cleanFoodMenuPanelDescription($, $element, name) {
  const clone = $element.clone();
  clone
    .find(
      ".fdm-item-title, .fdm-item-price, .food-item-title, .food-price, .list-column__headline, [class*='item-title'], [class*='ItemTitle'], [class*='price'], h3, h4, button, a",
    )
    .remove();
  const explicitDescription = cleanText(
    $element
      .find(
        ".food-item-description, .list-column__description, [class*='description'], [class*='desc']",
      )
      .first()
      .text(),
  );
  if (explicitDescription) {
    return explicitDescription.length > 420
      ? `${explicitDescription.slice(0, 417).trim()}...`
      : explicitDescription;
  }
  const text = cleanText(clone.text())
    ?.replace(/\bStart Your Order\b/gi, "")
    .replace(/\bView Full Menu\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text || text === name) {
    return null;
  }

  return text.length > 420 ? `${text.slice(0, 417).trim()}...` : text;
}

function disclosureFromMenuText(text, kind) {
  const directAllergens = [];
  const mayContain = [];

  for (const match of text?.matchAll(/\bContains:?\s*([^.;|]+)/gi) ?? []) {
    directAllergens.push(...findAllergensInText(match[1]));
  }

  for (const match of text?.matchAll(/\bAllergens?:?\s*([^.;|]+)/gi) ?? []) {
    directAllergens.push(...findAllergensInText(match[1]));
  }

  for (const match of text?.matchAll(/\bPossible Allergy:\s*([^.;|]+)/gi) ??
    []) {
    mayContain.push(...findAllergensInText(match[1]));
  }

  for (const match of text?.matchAll(/\bMay contain:?\s*([^.;|]+)/gi) ?? []) {
    mayContain.push(...findAllergensInText(match[1]));
  }

  if (directAllergens.length > 0 || mayContain.length > 0) {
    return {
      allergenSourceType:
        kind === sourceTypes.allergen
          ? allergenSourceTypes.officialAllergenMenu
          : allergenSourceTypes.officialProductAllergenSection,
      directAllergens: uniqueStrings(directAllergens),
      ingredientsText: null,
      mayContain: uniqueStrings(mayContain),
    };
  }

  return {
    allergenSourceType: allergenSourceTypes.unavailable,
    directAllergens: [],
    ingredientsText: null,
    mayContain: [],
  };
}

function extractHeadingMenuItems($, restaurant, url, kind = sourceTypes.menu) {
  if (kind === sourceTypes.allergen) {
    return [];
  }

  const scope = $(
    "main, [role='main'], .main-content, .site-content, article",
  ).first();
  const $scope = scope.length > 0 ? scope : $("body");
  const records = [];

  $scope.find("h3, h4, h5").each((_index, element) => {
    const $element = $(element);

    if ($element.parents("nav, header, footer, form").length > 0) {
      return;
    }

    const name = cleanMenuName($element.text());

    if (!name || !isProbablyMenuItemName(name)) {
      return;
    }

    if (headingOwnsParagraphMenuRows($, $element)) {
      return;
    }

    const description = getHeadingMenuDescription($, $element);

    if (!description && !hasFoodLanguage(name)) {
      return;
    }

    const previousCategory = cleanText(
      $element.prevAll("h1, h2, h3").first().text(),
    );
    const category =
      previousCategory && isProbablyCategoryName(previousCategory)
        ? titleCase(previousCategory)
        : restaurant.category;
    const disclosure = getScopedDomDisclosure($element.parent(), kind);

    records.push(
      createRecord({
        allergenSourceType: disclosure.allergenSourceType,
        allergens: disclosure.directAllergens,
        category,
        description,
        imageUrl: absolutizeUrl(
          $element.parent().find("img").first().attr("src") ??
            $element.parent().find("img").first().attr("data-src"),
          url,
        ),
        ingredientsText: disclosure.ingredientsText,
        mayContain: disclosure.mayContain,
        name,
        sourceKind: "html-card",
        sourceUrl: url,
        variantGroup: category,
      }),
    );
  });

  return records;
}

function extractParagraphMenuLineItems(
  $,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (kind === sourceTypes.allergen) {
    return [];
  }

  const scope = $(
    "main, [role='main'], .main-content, .site-content, article",
  ).first();
  const $scope = scope.length > 0 ? scope : $("body");
  const records = [];
  let currentCategory = restaurant.category;

  $scope.find("h2, h3, h4, h5, p").each((_index, element) => {
    const $element = $(element);
    const tagName = element.tagName?.toLowerCase();

    if ($element.parents("nav, header, footer, form").length > 0) {
      return;
    }

    if (/^h[2-5]$/.test(tagName ?? "")) {
      const heading = cleanText($element.text());

      if (heading && isProbablyCategoryName(heading)) {
        currentCategory = titleCase(heading);
      }

      return;
    }

    if (tagName !== "p") {
      return;
    }

    const parsed = parseParagraphMenuLine($element.text());

    if (!parsed || !isProbablyMenuItemName(parsed.name)) {
      return;
    }

    if (!parsed.description && !hasFoodLanguage(parsed.name)) {
      return;
    }

    const disclosure = getScopedDomDisclosure($element, kind);

    records.push(
      createRecord({
        allergenSourceType: disclosure.allergenSourceType,
        allergens: disclosure.directAllergens,
        category: currentCategory,
        description: parsed.description,
        imageUrl: null,
        ingredientsText: disclosure.ingredientsText,
        mayContain: disclosure.mayContain,
        name: parsed.name,
        sourceKind: "html-card",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  });

  return records;
}

function parseParagraphMenuLine(text) {
  const cleaned = cleanText(text);

  if (!cleaned || !paragraphMenuLineHasPrice(cleaned)) {
    return null;
  }

  const body = cleanText(
    cleaned.replace(
      /\s*\$?\d{1,3}(?:\.\d{2})?(?:\s*\/\s*\$?\d{1,3}(?:\.\d{2})?)?\s*$/i,
      "",
    ),
  );

  if (!body) {
    return null;
  }

  const pipeParts = body.split("|").map(cleanText).filter(Boolean);

  if (pipeParts.length >= 2) {
    return {
      description: summarizeIngredientText(pipeParts.slice(1).join(" ")),
      name: cleanMenuName(pipeParts[0]),
    };
  }

  const dashParts = body
    .split(/\s+[–—-]\s+/)
    .map(cleanText)
    .filter(Boolean);

  if (dashParts.length >= 2) {
    return {
      description: summarizeIngredientText(dashParts.slice(1).join(" ")),
      name: cleanMenuName(dashParts[0]),
    };
  }

  return {
    description: null,
    name: cleanMenuName(body),
  };
}

function paragraphMenuLineHasPrice(text) {
  return /\$?\d{1,3}(?:\.\d{2})?(?:\s*\/\s*\$?\d{1,3}(?:\.\d{2})?)?\s*$/i.test(
    text ?? "",
  );
}

function headingOwnsParagraphMenuRows($, $element) {
  let pricedRows = 0;

  $element.nextUntil("h1, h2, h3, h4, h5").each((_index, sibling) => {
    const $sibling = $(sibling);

    if (
      $sibling.is("p") &&
      (parseParagraphMenuLine($sibling.text()) ||
        parseInlineParagraphMenuItem($, $sibling))
    ) {
      pricedRows += 1;
    }

    return pricedRows < 1;
  });

  return pricedRows >= 1;
}

function getHeadingMenuDescription($, $element) {
  const pieces = [];

  $element.nextUntil("h1, h2, h3, h4, h5").each((_index, sibling) => {
    const $sibling = $(sibling);

    if ($sibling.is("script, style, noscript, img, picture, svg")) {
      return;
    }

    if ($sibling.find("h1, h2, h3, h4, h5").length > 0) {
      return false;
    }

    const text = cleanText($sibling.text());

    if (text) {
      pieces.push(text);
    }

    return pieces.join(" ").length < 280;
  });

  const description = cleanText(pieces.join(" "));

  if (!description || description === cleanText($element.text())) {
    return null;
  }

  return description.length > 360
    ? `${description.slice(0, 357).trim()}...`
    : description;
}

function extractStructuredListMenuItems(
  $,
  restaurant,
  url,
  kind = sourceTypes.menu,
) {
  if (kind === sourceTypes.allergen) {
    return [];
  }

  const scope = $("main, [role='main'], .main-content, .site-content").first();
  const $scope = scope.length > 0 ? scope : $("body");
  const records = [];
  let currentCategory = restaurant.category;

  $scope.find("h2, h3, h4, li").each((_index, element) => {
    const $element = $(element);
    const tagName = element.tagName?.toLowerCase();

    if (/^h[2-4]$/.test(tagName ?? "")) {
      const heading = cleanText($element.text());

      if (heading && isProbablyMenuItemName(heading)) {
        currentCategory = titleCase(heading);
      }

      return;
    }

    if (tagName !== "li") {
      return;
    }

    if ($element.parents("nav, header, footer, form").length > 0) {
      return;
    }

    const parsed = parseStructuredListMenuItem($, $element);

    if (!parsed || !isProbablyMenuItemName(parsed.name)) {
      return;
    }

    if (!parsed.description && !hasFoodLanguage(parsed.name)) {
      return;
    }

    const disclosure = getScopedDomDisclosure($element, kind);

    records.push(
      createRecord({
        allergenSourceType: disclosure.allergenSourceType,
        allergens: disclosure.directAllergens,
        category: currentCategory,
        description: parsed.description,
        imageUrl: absolutizeUrl(
          $element.find("img").first().attr("src") ??
            $element.find("img").first().attr("data-src"),
          url,
        ),
        ingredientsText: disclosure.ingredientsText,
        mayContain: disclosure.mayContain,
        name: parsed.name,
        sourceKind: "html-card",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  });

  return records;
}

function parseStructuredListMenuItem($, $element) {
  const explicitName = cleanText(
    $element
      .find(
        "[class*='item-name'], [class*='menu-item-title'], [class*='menu-title'], h3, h4, strong, b",
      )
      .first()
      .text(),
  );
  const explicitDescription = cleanText(
    $element
      .find("[class*='description'], [class*='desc'], [class*='copy'], p")
      .first()
      .text(),
  );

  if (explicitName) {
    return {
      description: explicitDescription,
      name: explicitName,
    };
  }

  const textParts = [];

  $element.contents().each((_index, node) => {
    if (node.type === "text") {
      const text = cleanText(node.data);

      if (text) {
        textParts.push(text);
      }
    }
  });

  const text = textParts.join(" ");
  const lines = text
    .split(/\s{2,}|\n|\r/)
    .map(cleanText)
    .filter(Boolean);
  const name = cleanText(lines[0] ?? text);

  if (!name) {
    return null;
  }

  const fullText = cleanText($element.text());
  const description = cleanText(
    explicitDescription ??
      (fullText && fullText !== name
        ? fullText.replace(name, "").trim()
        : null),
  );

  return {
    description,
    name,
  };
}

export function extractProductPageItem(html, restaurant, url, fallbackName) {
  const $ = cheerio.load(html);
  const title =
    cleanText($("h1").first().text()) ??
    cleanText($("meta[property='og:title']").attr("content")) ??
    fallbackName;
  const description =
    cleanText($("meta[name='description']").attr("content")) ??
    cleanText($("meta[property='og:description']").attr("content")) ??
    cleanText(
      $(
        "[class*='description'], [class*='Description'], [class*='details'], main p",
      )
        .first()
        .text(),
    );
  const imageUrl = absolutizeUrl(
    $("meta[property='og:image']").attr("content") ??
      $("main img").first().attr("src") ??
      $("img").first().attr("src"),
    url,
  );
  const allergenText = [
    $("#allergensInfo").text(),
    $("[class*='allergen'], [id*='allergen']").text(),
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(" ");
  const ingredientsText = extractProductPageIngredientsText($, html);
  const disclosureText = [allergenText, ingredientsText]
    .map(cleanText)
    .filter(Boolean)
    .join(" ");
  const structuredRecords = extractJsonItemsFromHtml(
    $,
    restaurant,
    url,
    sourceTypes.allergen,
  );
  const matchingStructured = structuredRecords.find(
    (record) => similarityKey(record.name) === similarityKey(title),
  );

  if (!title || !isProbablyMenuItemName(title)) {
    return null;
  }

  return createRecord({
    allergens: uniqueStrings([
      ...(matchingStructured?.allergens ?? []),
      ...findDeclaredAllergensOnly(allergenText),
      ...findProductPageDeclaredAllergens(ingredientsText ?? ""),
    ]),
    allergenSourceType:
      disclosureText ||
      (matchingStructured?.allergenSourceType &&
        matchingStructured.allergenSourceType !==
          allergenSourceTypes.unavailable)
        ? allergenSourceTypes.officialProductAllergenSection
        : allergenSourceTypes.unavailable,
    category:
      inferCategoryFromUrl(url) ??
      matchingStructured?.category ??
      restaurant.category,
    description: description ?? matchingStructured?.description ?? null,
    imageUrl: imageUrl ?? matchingStructured?.imageUrl ?? null,
    ingredientsText:
      matchingStructured?.ingredientsText ?? ingredientsText ?? null,
    mayContain: uniqueStrings([
      ...(matchingStructured?.mayContain ?? []),
      ...findProductPageMayContainAllergens(disclosureText),
    ]),
    name: title,
    sourceKind: "product-page",
    sourceUrl: url,
  });
}

function extractProductPageIngredientsText($, html) {
  const candidates = [];

  for (const match of String(html).matchAll(
    /(?:^|[,{]\s*)"?ingredients"?\s*:\s*"((?:\\.|[^"\\]){20,6000})"/gi,
  )) {
    candidates.push(decodeJavaScriptString(match[1]));
  }

  for (const match of String(html).matchAll(
    /(?:^|[,{]\s*)"?full_ingredients"?\s*:\s*"((?:\\.|[^"\\]){20,6000})"/gi,
  )) {
    candidates.push(decodeJavaScriptString(match[1]));
  }

  const bodyText = cleanText($("body").text()) ?? "";
  const ingredientsSection = bodyText.match(
    /\bIngredients\b\s+([\s\S]{20,3500}?)(?=\b(?:Product & Storage Details|Storage Instructions|Serving Instructions|Frequently Asked|You may also like|Customers Also|Reviews|Nutrition Facts|Nutritional Information)\b|$)/i,
  )?.[1];
  const treatContainsSection = bodyText.match(
    /\bThis treat contains:\s*([\s\S]{3,600}?)(?=\b(?:Our treats are made|Ingredients:|Product & Storage Details|Storage Instructions|Serving Instructions)\b|$)/i,
  )?.[0];

  candidates.push(ingredientsSection, treatContainsSection);

  const cleaned = uniqueStrings(
    candidates
      .map((candidate) => cleanText(candidate))
      .filter(Boolean)
      .filter(
        (candidate) => !isPollutedProductPageIngredientCandidate(candidate),
      )
      .filter((candidate) =>
        /\b(?:ingredients?|contains|may contain|facility|process(?:es|ed)?)\b/i.test(
          candidate,
        ),
      ),
  );

  if (cleaned.length === 0) {
    return null;
  }

  return compactProductPageIngredientsText(
    cleaned.sort((left, right) => {
      const leftHasContains = /\bcontains\b/i.test(left) ? 1 : 0;
      const rightHasContains = /\bcontains\b/i.test(right) ? 1 : 0;
      return rightHasContains - leftHasContains || right.length - left.length;
    })[0],
  );
}

function isPollutedProductPageIngredientCandidate(text) {
  return (
    /(?:^|[,{]\s*)"?[a-z0-9_]{3,}"?\s*:\s*"/i.test(text) ||
    /\b(?:crumbl_drinks_|download_the_app|seo_privacy_title|initialI18nStore|nextI18Next|all_rights_reserved|cookie_preferences)\b/i.test(
      text,
    )
  );
}

function compactProductPageIngredientsText(text) {
  const cleaned = cleanText(text);

  if (!cleaned || cleaned.length <= 1200) {
    return cleaned;
  }

  const containsMatch = cleaned.match(
    /\b(?:This treat contains|CONTAINS):\s*[\s\S]{0,500}?(?=\b(?:MAY CONTAIN|GLUTEN FREE|VEGAN|DAIRY FREE|Ingredients?:|Made in|Processed in|Product & Storage Details)\b|[.;]|$)/i,
  )?.[0];
  const facilityMatch = cleaned.match(
    /\b(?:facility|kitchen)\s+that\s+(?:also\s+)?process(?:es|ed)?\s*:?\s*[\s\S]{0,300}?(?=\bIngredients?\s*:|\b(?:Product & Storage Details|Storage Instructions|Serving Instructions)\b|[.;]|$)/i,
  )?.[0];
  const suffix = uniqueStrings(
    [containsMatch, facilityMatch].map(cleanText).filter(Boolean),
  ).join(" ");

  return (
    cleanText(`${cleaned.slice(0, 900).trim()}... ${suffix}`) ??
    cleaned.slice(0, 1200)
  );
}

function findProductPageDeclaredAllergens(text) {
  const source = String(text ?? "");
  const directSections = [
    ...source.matchAll(
      /\bThis treat contains:\s*([\s\S]{0,500}?)(?=\b(?:Our treats are made|Made in|Processed in|Ingredients?:|Product & Storage Details)\b|[.;]|$)/gi,
    ),
    ...source.matchAll(
      /\bCONTAINS:\s*([\s\S]{0,500}?)(?=\b(?:MAY CONTAIN|GLUTEN FREE|VEGAN|DAIRY FREE|Ingredients?:|Made in|Processed in|Product & Storage Details)\b|[.;]|$)/gi,
    ),
  ]
    .map((match) => cleanText(match[1]))
    .filter(Boolean)
    .filter((section) => findAllergensInText(section).length > 0);

  return directSections.length > 0
    ? uniqueStrings(directSections.flatMap(findAllergensInText))
    : findDeclaredAllergensOnly(source);
}

function findProductPageMayContainAllergens(text) {
  const source = String(text ?? "");
  const facilitySections = [
    ...source.matchAll(
      /\b(?:facility|kitchen)\s+that\s+(?:also\s+)?process(?:es|ed)?\s*:?\s*([\s\S]{0,300}?)(?=\bIngredients?\s*:|\b(?:Product & Storage Details|Storage Instructions|Serving Instructions)\b|[.;]|$)/gi,
    ),
    ...source.matchAll(
      /\bmade\s+in\s+(?:a\s+)?(?:facility|kitchen)\s+(?:that\s+)?(?:also\s+)?process(?:es|ed)?\s*:?\s*([\s\S]{0,300}?)(?=\bIngredients?\s*:|\b(?:Product & Storage Details|Storage Instructions|Serving Instructions)\b|[.;]|$)/gi,
    ),
  ]
    .map((match) => cleanText(match[1]))
    .filter(Boolean);

  return uniqueStrings([
    ...findMayContainAllergens(source),
    ...facilitySections.flatMap(findAllergensInText),
  ]);
}

async function extractPdfItems(
  text,
  restaurant,
  url,
  buffer,
  kind = sourceTypes.menu,
) {
  const brandRecords = await extractBrandPdfItems(
    text,
    restaurant,
    url,
    buffer,
  );

  if (brandRecords.length > 0) {
    return brandRecords;
  }

  if (shouldSkipGenericPdfFallbackForBrandDocument(text, restaurant, url)) {
    return [];
  }

  const officialAllergenDocument =
    kind === sourceTypes.allergen || isOfficialAllergenDocumentUrl(url);

  if (officialAllergenDocument && buffer) {
    const tableMatrixRecords = await extractGenericPdfTableAllergenMatrixRows(
      buffer,
      restaurant,
      url,
    );

    if (tableMatrixRecords.length > 0) {
      return tableMatrixRecords;
    }

    const matrixRecords = await extractGenericPdfMenuMatrixRows(
      buffer,
      restaurant,
      url,
    );

    if (matrixRecords.length > 0) {
      return matrixRecords;
    }
  }

  if (!officialAllergenDocument) {
    if (
      getBrandAdapter(restaurant.id).allowGenericDomMenu &&
      restaurant.allowUnavailableAllergenFallback === true
    ) {
      return mergePdfMenuRecords(
        extractGenericPdfMenuItems(text, restaurant, url),
        await extractGenericPdfCompactGridItems(buffer, restaurant, url),
      );
    }

    return [];
  }

  const records = [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+\t/g, "\t").replace(/\t\s+/g, "\t").trim())
    .filter(Boolean);
  let currentCategory = restaurant.category;

  for (const line of lines) {
    const cleanLine = cleanText(line);

    if (!cleanLine) {
      continue;
    }

    if (isCategoryLine(cleanLine)) {
      currentCategory = titleCase(cleanLine);
      continue;
    }

    const tabParts = line.split(/\t+/).map(cleanText).filter(Boolean);
    let name = null;
    let detail = null;

    if (tabParts.length >= 2) {
      name = tabParts[0];
      detail = tabParts.slice(1).join(" ");
    } else {
      const containsIndex = cleanLine.search(
        /\b(?:contains|may contain|allergens?)\b/i,
      );
      const prefix =
        containsIndex > 3 ? cleanLine.slice(0, containsIndex).trim() : "";
      const splitMatch = prefix.match(/^(.{2,90}?)(?:\s{2,}| - |: )/);
      name = splitMatch?.[1] ?? null;
      detail = cleanLine;
    }

    if (!name || !detail || !isProbablyMenuItemName(name)) {
      continue;
    }

    const direct = findAllergensInDeclaredFoodText(detail);
    const mayContain = findMayContainAllergens(detail);

    if (
      direct.length === 0 &&
      mayContain.length === 0 &&
      !/\bingredients?\b/i.test(detail)
    ) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: /\ballergens?\b/i.test(detail)
          ? allergenSourceTypes.officialAllergenMenu
          : allergenSourceTypes.officialIngredients,
        allergens: direct,
        category: currentCategory,
        description: summarizeIngredientText(detail),
        imageUrl: null,
        ingredientsText: detail,
        mayContain,
        name,
        sourceKind: "pdf-ingredients",
        sourceUrl: url,
      }),
    );
  }

  if (records.length > 0) {
    return records;
  }

  const adapter = getBrandAdapter(restaurant.id);

  if (
    adapter.allowGenericDomMenu &&
    restaurant.allowUnavailableAllergenFallback === true
  ) {
    const menuRecords = mergePdfMenuRecords(
      extractGenericPdfMenuItems(text, restaurant, url),
      await extractGenericPdfCompactGridItems(buffer, restaurant, url),
    );

    if (menuRecords.length > 0) {
      return menuRecords;
    }
  }

  return [];
}

function mergePdfMenuRecords(...groups) {
  return uniqueBy(
    groups.flat().filter((record) => isProbablyMenuCatalogRecord(record)),
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );
}

function extractGenericPdfMenuItems(text, restaurant, url) {
  const lines = text
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((line) => cleanText(line?.replace(/\t+/g, " ")))
    .filter(Boolean)
    .filter((line) => !isGenericPdfMenuArtifactLine(line));
  const records = [];
  let currentCategory = restaurant.category;
  let pending = null;

  for (const line of lines) {
    if (isGenericPdfMenuCategoryLine(line)) {
      flushPending();
      currentCategory = titleCase(line);
      continue;
    }

    const nutritionRow = parseGenericPdfNutritionTableLine(line);

    if (nutritionRow) {
      const parentName = pending?.name;
      const name = genericPdfNutritionDisplayName(
        nutritionRow.name,
        parentName,
      );

      if (
        name &&
        isProbablyMenuItemName(name) &&
        hasGenericPdfMenuItemEvidence(
          { descriptionLines: [nutritionRow.servingSize], price: null },
          name,
          nutritionRow.servingSize,
        ) &&
        normalizeMenuName(name) !== normalizeMenuName(restaurant.name) &&
        !isGenericPdfMenuNonFoodName(name, nutritionRow.servingSize)
      ) {
        records.push(
          createRecord({
            allergenSourceType: allergenSourceTypes.unavailable,
            allergens: [],
            category: currentCategory,
            description: `Official nutrition PDF. Serving size: ${nutritionRow.servingSize}.`,
            imageUrl: null,
            ingredientsText: null,
            mayContain: [],
            name,
            nutritionFacts: nutritionFactsFromGenericPdfNutritionValues(
              nutritionRow.servingSize,
              nutritionRow.values,
            ),
            sourceKind: "pdf-nutrition-menu",
            sourceUrl: url,
            variantGroup: currentCategory,
          }),
        );
      }

      pending = null;
      continue;
    }

    const pricedLine = parseGenericPdfMenuPricedLine(line);

    if (pricedLine) {
      if (
        pending &&
        shouldAttachPricedLineToGenericPdfPending(pending, pricedLine)
      ) {
        pending.descriptionLines.push(
          pricedLine.description ?? pricedLine.name,
        );
        pending.price = pricedLine.price;
        continue;
      }

      flushPending();
      pending = {
        category: currentCategory,
        descriptionLines: pricedLine.description
          ? [pricedLine.description]
          : [],
        name: pricedLine.name,
        price: pricedLine.price,
      };
      continue;
    }

    const priceOnly = parseGenericPdfMenuPriceOnlyLine(line);

    if (priceOnly && pending) {
      pending.price = priceOnly;
      continue;
    }

    if (
      pending &&
      !pending.price &&
      pending.descriptionLines.length > 0 &&
      isGenericPdfMenuStandaloneName(line) &&
      !isMostlyUppercase(line)
    ) {
      pending.descriptionLines.push(line);
      continue;
    }

    if (isGenericPdfMenuStandaloneName(line)) {
      flushPending();
      pending = {
        category: currentCategory,
        descriptionLines: [],
        name: cleanMenuName(line),
        price: null,
      };
      continue;
    }

    if (pending && isGenericPdfMenuDescriptionLine(line)) {
      pending.descriptionLines.push(line);
    }
  }

  flushPending();

  return uniqueBy(
    records.filter((record) => isProbablyMenuCatalogRecord(record)),
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );

  function flushPending() {
    if (!pending) {
      return;
    }

    const description = summarizeIngredientText(
      pending.descriptionLines.join(" "),
    );
    const name = cleanMenuName(pending.name);
    const officialDocument = isOfficialAllergenDocumentUrl(url);
    const disclosure = disclosureFromMenuText(
      [name, description].filter(Boolean).join(" "),
      officialDocument ? sourceTypes.allergen : sourceTypes.menu,
    );

    if (
      name &&
      isProbablyMenuItemName(name) &&
      hasGenericPdfMenuItemEvidence(pending, name, description) &&
      (description || hasFoodLanguage(name)) &&
      normalizeMenuName(name) !== normalizeMenuName(restaurant.name) &&
      !isGenericPdfMenuNonFoodName(name, description)
    ) {
      records.push(
        createRecord({
          allergenSourceType: disclosure.allergenSourceType,
          allergens: disclosure.directAllergens,
          category: pending.category,
          description,
          imageUrl: null,
          ingredientsText:
            disclosure.allergenSourceType !== allergenSourceTypes.unavailable
              ? description
              : null,
          mayContain: disclosure.mayContain,
          name,
          sourceKind: "pdf-menu",
          sourceUrl: url,
          variantGroup: pending.category,
        }),
      );
    }

    pending = null;
  }
}

async function extractGenericPdfCompactGridItems(buffer, restaurant, url) {
  if (!buffer) {
    return [];
  }

  const rows = await readPdfPositionRows(buffer);
  const records = [];
  let activeGrid = null;

  for (const row of rows) {
    const rowText = cleanText(row.items.map((item) => item.str).join(" "));

    if (!rowText || isGenericPdfMenuArtifactLine(rowText)) {
      continue;
    }

    const category = compactPdfGridCategory(row);

    if (category) {
      activeGrid = {
        category: titleCase(category),
        pageNumber: row.pageNumber,
        y: row.y,
      };
      continue;
    }

    if (
      activeGrid &&
      (activeGrid.pageNumber !== row.pageNumber ||
        activeGrid.y - row.y > 130 ||
        isGenericPdfMenuCategoryLine(rowText))
    ) {
      activeGrid = null;
    }

    if (!activeGrid) {
      continue;
    }

    for (const item of row.items) {
      const name = cleanMenuName(item.str);

      if (!isCompactPdfGridItemName(name)) {
        continue;
      }

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.unavailable,
          allergens: [],
          category: activeGrid.category,
          description: `Menu PDF item listed under ${activeGrid.category}.`,
          imageUrl: null,
          ingredientsText: null,
          mayContain: [],
          name,
          sourceKind: "pdf-menu-grid",
          sourceUrl: url,
          variantGroup: activeGrid.category,
        }),
      );
    }
  }

  return uniqueBy(
    records.filter((record) => isProbablyMenuCatalogRecord(record)),
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );
}

function compactPdfGridCategory(row) {
  if (!row?.items?.length) {
    return null;
  }

  const priceItem = row.items.at(-1);

  if (!/^\$?\d{1,3}(?:\.\d{2})?$/.test(priceItem?.str ?? "")) {
    return null;
  }

  const category = cleanText(
    row.items
      .slice(0, -1)
      .map((item) => item.str)
      .join(" "),
  );

  if (
    !category ||
    !/^(?:sides?(?:\s+(?:and|&)\s+stuff)?|stuff|extras?|add-?ons?|sauces?)$/i.test(
      category,
    )
  ) {
    return null;
  }

  return category;
}

function isCompactPdfGridItemName(name) {
  const cleaned = cleanMenuName(name);

  if (
    !cleaned ||
    !isProbablyMenuItemName(cleaned) ||
    isGenericPdfMenuNonFoodName(cleaned, null)
  ) {
    return false;
  }

  if (
    isGenericPdfMenuCategoryLine(cleaned) ||
    isGenericPdfMenuArtifactLine(cleaned)
  ) {
    return false;
  }

  if (
    /^(?:drinks?|sauces?|coming to a city near you!?|@|i\s+|#)/i.test(cleaned)
  ) {
    return false;
  }

  return (
    hasFoodLanguage(cleaned) ||
    /\b(?:chips?|fries|hummus|pita|tabouli|tahini|salad|falafel)\b/i.test(
      cleaned,
    )
  );
}

function parseGenericPdfNutritionTableLine(line) {
  const cleaned = cleanText(line);

  if (!cleaned) {
    return null;
  }

  const tokens = cleaned.split(/\s+/);
  const values = [];

  while (
    tokens.length > 0 &&
    values.length < 11 &&
    isGenericPdfNutritionNumber(tokens.at(-1))
  ) {
    values.unshift(tokens.pop());
  }

  if (values.length < 9) {
    return null;
  }

  const servingStart = genericPdfServingSizeStartIndex(tokens);

  if (servingStart <= 0) {
    return null;
  }

  const name = cleanGenericPdfNutritionName(
    tokens.slice(0, servingStart).join(" "),
  );
  const servingSize = cleanText(tokens.slice(servingStart).join(" "));

  if (!name || !servingSize || !isProbablyMenuItemName(name)) {
    return null;
  }

  return { name, servingSize, values };
}

function cleanGenericPdfNutritionName(name) {
  const rawName = cleanText(name);
  const cleaned = cleanMenuName(rawName);

  if (!rawName || !cleaned) {
    return cleaned;
  }

  const forCount = rawName.match(/\bfor\s+(\d+)$/i);

  if (forCount && /\bfor$/i.test(cleaned)) {
    return cleanText(`${cleaned} ${forCount[1]}`);
  }

  return cleaned;
}

function genericPdfServingSizeStartIndex(tokens) {
  for (let index = tokens.length - 1; index > 0; index -= 1) {
    const value = tokens[index];
    const previous = tokens[index - 1];

    if (!isGenericPdfServingUnit(value)) {
      continue;
    }

    if (isGenericPdfServingAmount(previous)) {
      return index - 1;
    }

    if (
      /^(?:dinner|lunch|plate|order|each|salad|bowl|cup)$/i.test(value) &&
      previous === "1"
    ) {
      return index - 1;
    }
  }

  return -1;
}

function genericPdfNutritionDisplayName(name, parentName) {
  const cleanedName = cleanMenuName(name);
  const cleanedParent = cleanMenuName(parentName);

  if (!cleanedName) {
    return null;
  }

  if (
    cleanedParent &&
    cleanedParent !== cleanedName &&
    /^(?:with|without|for\s+\d+|cup|bowl)$/i.test(cleanedName)
  ) {
    return cleanMenuName(`${cleanedParent} ${cleanedName}`);
  }

  return cleanedName;
}

function isGenericPdfNutritionNumber(value) {
  return /^-?\d+(?:\.\d+)?$/.test(String(value ?? ""));
}

function isGenericPdfServingAmount(value) {
  return /^(?:\d+(?:\.\d+)?|\d+\/\d+)$/.test(String(value ?? ""));
}

function isGenericPdfServingUnit(value) {
  return /^(?:bag|bowl|cup|dinner|each|lb|lunch|oz|order|piece|pieces|pint|plate|quart|salad|serving|skewer|slice|taco|tamale)$/i.test(
    String(value ?? ""),
  );
}

function nutritionFactsFromGenericPdfNutritionValues(servingSize, values) {
  const labels = [
    "Serving Weight",
    "Calories",
    "Calories from Fat",
    "Total Fat",
    "Saturated Fat",
    "Cholesterol",
    "Sodium",
    "Total Carbohydrates",
    "Dietary Fiber",
    "Sugars",
    "Protein",
  ];
  const facts = { "Serving Size": servingSize };

  for (const [index, label] of labels.entries()) {
    if (values[index]) {
      facts[label] = values[index];
    }
  }

  return facts;
}

function hasGenericPdfMenuItemEvidence(pending, name, description) {
  if (pending?.price) {
    return true;
  }

  const descriptionLineCount = pending?.descriptionLines?.length ?? 0;
  const haystack = `${name ?? ""} ${description ?? ""}`;

  if (
    descriptionLineCount > 0 &&
    descriptionLineCount <= 4 &&
    hasFoodLanguage(haystack)
  ) {
    return true;
  }

  return (
    descriptionLineCount > 1 &&
    descriptionLineCount <= 3 &&
    hasFoodLanguage(name ?? "")
  );
}

function isOfficialAllergenDocumentUrl(url) {
  return /\b(?:allergen|allergy|ingredient|nutrition|nutritional|calculator|dietary|sensitivity|sensitivities)\b/i.test(
    decodeUrlText(url),
  );
}

function decodeUrlText(value) {
  const text = String(value ?? "");

  try {
    return decodeURIComponent(text);
  } catch {
    return text.replace(/%20/g, " ");
  }
}

function parseGenericPdfMenuPriceOnlyLine(line) {
  const match = cleanText(line)?.match(/^\$?\s*(\d{1,3})(?:\.\d{2})?$/);

  return match ? Number(match[1]) : null;
}

function parseGenericPdfMenuPricedLine(line) {
  const cleaned = cleanText(line);
  const inlineDisclosureMatch = cleaned?.match(
    /^(.{2,120}?)\s+\$?(\d{1,3})(?:\.\d{2})?(?:\s*\/\s*\$?\d{1,3}(?:\.\d{2})?)?\s+((?:ALLERGENS?|CONTAINS?|MAY CONTAIN):?.+)$/i,
  );
  const match =
    inlineDisclosureMatch ??
    cleaned?.match(
      /^(.{2,120}?)\s+\$?(\d{1,3})(?:\.\d{2})?(?:\s*\/\s*\$?\d{1,3}(?:\.\d{2})?)?$/,
    );

  if (!match) {
    return null;
  }

  const name = cleanMenuName(match[1]);

  if (
    !name ||
    isGenericPdfMenuCategoryLine(name) ||
    isGenericPdfMenuNonFoodName(name, null)
  ) {
    return null;
  }

  return {
    description: inlineDisclosureMatch
      ? cleanText(inlineDisclosureMatch[3])
      : null,
    name,
    price: Number(match[2]),
  };
}

function shouldAttachPricedLineToGenericPdfPending(pending, pricedLine) {
  if (!pending || !pricedLine) {
    return false;
  }

  if (hasFoodLanguage(pending.name) && !hasFoodLanguage(pricedLine.name)) {
    return true;
  }

  return (
    isMostlyUppercase(pending.name) &&
    pending.descriptionLines.length <= 4 &&
    !isMostlyUppercase(pricedLine.name)
  );
}

function isGenericPdfMenuStandaloneName(line) {
  const cleaned = cleanMenuName(line);

  if (!cleaned || !isProbablyMenuItemName(cleaned)) {
    return false;
  }

  if (isGenericPdfMenuNonFoodName(cleaned, null)) {
    return false;
  }

  if (isMostlyUppercase(cleaned) && cleaned.split(/\s+/).length <= 5) {
    return true;
  }

  return (
    /^[A-Z]/.test(cleaned) &&
    cleaned.split(/\s+/).length <= 6 &&
    !cleaned.includes(",") &&
    !/[,.!?]$/.test(cleaned) &&
    !/^(?:and|or|with|on|in|of|served|local|house|braised|fried|pickled|seasonal|assorted)\b/i.test(
      cleaned,
    )
  );
}

function isGenericPdfMenuDescriptionLine(line) {
  const cleaned = cleanText(line);

  if (!cleaned || cleaned.length > 160) {
    return false;
  }

  if (
    isGenericPdfMenuArtifactLine(cleaned) ||
    isGenericPdfMenuCategoryLine(cleaned)
  ) {
    return false;
  }

  return true;
}

function isGenericPdfMenuCategoryLine(line) {
  const cleaned = cleanText(line);

  if (!cleaned) {
    return false;
  }

  return /^(?:small|medium|large|snacks?|tapas|mezze|mashawi|desserts?|sides?|salads?|sandwiches?|barbe?cue|plates?|appetizers?|entrees?|fuertes|paella style|from the garden|table side(?: on the cart)?)$/i.test(
    cleaned,
  );
}

function isGenericPdfMenuArtifactLine(line) {
  const cleaned = cleanText(line);

  if (!cleaned) {
    return true;
  }

  return (
    /^--\s*\d+\s+of\s+\d+\s*--$/i.test(cleaned) ||
    /^-\s*/.test(cleaned) ||
    /^(?:add|or|with choice of)\b/i.test(cleaned) ||
    /^(?:v\s*-\s*vegan|gf\s*-\s*gluten free|df\s*-\s*dairy free|\*{1,2}\s*kindly note|a \d+% service charge|tipping is not expected)/i.test(
      cleaned,
    ) ||
    /^(?:allow our chefs|spontaneous|discover the wines|explore the work|or explore|food \d+)/i.test(
      cleaned,
    )
  );
}

function isGenericPdfMenuNonFoodName(name, description) {
  const text = `${name ?? ""} ${description ?? ""}`;
  const nameText = cleanMenuName(name);

  if (isAlwaysGenericPdfMenuNonFoodName(nameText)) {
    return true;
  }

  if (hasFoodLanguage(text)) {
    return false;
  }

  return (
    /^[&]/.test(name ?? "") ||
    /^\(?[A-Z]{1,3}(?:,\s*[A-Z]{1,3})+\)?$/i.test(name ?? "") ||
    /\b(?:teapigs|amaretto|amaro|anisette|anejo|averna|aveze|benedictine|brachetto|brandy|braulio|caffo|cognac|digestivi|fernet|fortificati|frangelico|grappa|limoncello|liqueur|macallan|madeira|marnier|meletti|melletti|montenegro|nocino|nonino|port|tequila|vin santo|wine|wines|beer|cocktails?|vodka|gin|rum|whiskey|whisky|bourbon|mezcal|champagne|brut|naturellement|sancerre|bordeaux|chardonnay|pinot|riesling|cabernet|sauvignon|shopapp|automatic tax|sell on|facebook|instagram)\b/i.test(
      text,
    )
  );
}

function isAlwaysGenericPdfMenuNonFoodName(name) {
  const cleaned = cleanMenuName(name);

  if (!cleaned) {
    return true;
  }

  return /^(?:children:?\s*(?:\d+\s*&\s*under)?|coffee(?:\s*&\s*tea)?|coffee\s*[–—-].*|espresso|latte|cappuccino|hot\s+tea|fresh\s+squeezed\s+oj|for\s+the\s+table|small\s+plates?\s*&\s*stations?|parmesan\s+cheese|.*\b(?:spritz|fizz|tonic|glow|tropicale|passion)\b.*)$/i.test(
    cleaned,
  );
}

function isMostlyUppercase(value) {
  const letters = cleanText(value)?.replace(/[^a-z]/gi, "") ?? "";

  if (letters.length < 3) {
    return false;
  }

  const upper = letters.replace(/[^A-Z]/g, "").length;

  return upper / letters.length >= 0.7;
}

async function extractGenericPdfTableAllergenMatrixRows(
  buffer,
  restaurant,
  url,
) {
  const tables = await readPdfTables(buffer);
  const records = [];
  let currentCategory = restaurant.category;
  let currentColumns = [];

  for (const table of tables) {
    for (const rawRow of table ?? []) {
      const cells = rawRow.map((cell) => cleanText(cell) ?? "");

      if (!cells.some(Boolean)) {
        continue;
      }

      if (cells.length === 1) {
        const category = normalizeGenericMatrixCategory(cells[0]);

        if (category) {
          currentCategory = category;
        }

        continue;
      }

      const headerColumns = genericPdfTableAllergenColumns(cells);

      if (headerColumns.length >= 3) {
        currentCategory =
          normalizeGenericMatrixCategory(cells[0]) ?? currentCategory;
        currentColumns = headerColumns;
        continue;
      }

      if (currentColumns.length === 0) {
        currentColumns = defaultGenericPdfTableAllergenColumns(cells);
      }

      if (currentColumns.length < 3) {
        continue;
      }

      const name = cleanGenericMatrixItemName(cells[0]);

      if (!isGenericMatrixItemName(name)) {
        continue;
      }

      const direct = [];
      const mayContain = [];

      for (const column of currentColumns) {
        const cell = cells[column.index] ?? "";

        if (/\bmay\b/i.test(cell)) {
          mayContain.push(...column.allergens);
        } else if (isGenericMatrixAllergenCellEvidence(cell)) {
          direct.push(...column.allergens);
        }
      }

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens: direct,
          category: currentCategory,
          description: `Official ${restaurant.name} allergen matrix.`,
          imageUrl: null,
          mayContain,
          name,
          sourceKind: "pdf-matrix",
          sourceUrl: url,
          variantGroup: currentCategory,
        }),
      );
    }
  }

  const officialRows = uniqueBy(
    records.filter(
      (record) => record.name && isProbablyMenuItemName(record.name),
    ),
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );

  return officialRows.length >= 5 ? officialRows : [];
}

function genericPdfTableAllergenColumns(cells) {
  return cells.flatMap((cell, index) => {
    if (index === 0) {
      return [];
    }

    const allergens = genericMatrixHeaderAllergens(cell);

    return allergens.length > 0 ? [{ allergens, index }] : [];
  });
}

function defaultGenericPdfTableAllergenColumns(cells) {
  if (cells.length < 10 || cells.length > 12) {
    return [];
  }

  return [
    { allergens: ["egg"], index: 1 },
    { allergens: ["fish"], index: 2 },
    { allergens: ["milk"], index: 3 },
    { allergens: ["peanut"], index: 4 },
    { allergens: ["sesame"], index: 5 },
    { allergens: ["shellfish"], index: 6 },
    { allergens: ["soy"], index: 7 },
    { allergens: ["tree-nut"], index: 8 },
    { allergens: ["wheat", "gluten"], index: 9 },
  ];
}

async function extractGenericPdfMenuMatrixRows(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const columnsByPage = genericPdfAllergenColumnsByPage(rows);

  if (columnsByPage.size === 0) {
    return [];
  }

  const records = [];
  const currentCategoryByPage = new Map();
  let previousCandidate = null;

  for (const row of rows) {
    const pageColumns = columnsByPage.get(row.pageNumber);

    if (!pageColumns) {
      continue;
    }

    const rowText =
      cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const pageTitleCategory = genericMatrixCategoryFromTitle(rowText);

    if (pageTitleCategory) {
      currentCategoryByPage.set(row.pageNumber, pageTitleCategory);
      previousCandidate = null;
      continue;
    }

    const leftItems = row.items.filter(
      (item) => item.x < pageColumns.firstX - 12,
    );
    const leftText = cleanText(leftItems.map((item) => item.str).join(" "));

    if (genericPdfAllergenColumnsFromRow(row).length > 0) {
      const category = normalizeGenericMatrixCategory(leftText);

      if (category) {
        currentCategoryByPage.set(row.pageNumber, category);
      }

      previousCandidate = null;
      continue;
    }

    if (!leftText || isGenericMatrixContinuationOnly(leftText)) {
      continue;
    }

    const matrixName = cleanGenericMatrixItemName(leftText);

    if (
      previousCandidate &&
      previousCandidate.pageNumber === row.pageNumber &&
      previousCandidate.y - row.y <= 18 &&
      shouldJoinGenericMatrixName(previousCandidate.name, matrixName)
    ) {
      previousCandidate.name = cleanGenericMatrixItemName(
        `${previousCandidate.name} ${matrixName}`,
      );
      previousCandidate.yValues.push(row.y);
      previousCandidate.details.push(
        ...genericMatrixCellDetails(row, pageColumns),
      );
      previousCandidate.allergens.push(
        ...genericMatrixCellAllergens(row, pageColumns),
      );
      continue;
    }

    if (!isGenericMatrixItemName(matrixName)) {
      previousCandidate = null;
      continue;
    }

    const candidate = {
      allergens: genericMatrixCellAllergens(row, pageColumns),
      category:
        currentCategoryByPage.get(row.pageNumber) ?? restaurant.category,
      details: genericMatrixCellDetails(row, pageColumns),
      name: matrixName,
      pageNumber: row.pageNumber,
      yValues: [row.y],
    };
    records.push(candidate);
    previousCandidate = candidate;
  }

  return uniqueBy(
    records
      .map((record) => {
        const allergens = uniqueStrings(record.allergens);
        const details = uniqueStrings(record.details).join("; ");
        const hasOfficialSignals = allergens.length > 0;

        return createRecord({
          allergenSourceType: hasOfficialSignals
            ? allergenSourceTypes.officialAllergenMenu
            : allergenSourceTypes.unavailable,
          allergens,
          category: record.category,
          description: details
            ? `Official ${restaurant.name} allergen matrix note: ${details}`
            : `Official ${restaurant.name} menu item from allergen matrix.`,
          imageUrl: null,
          ingredientsText: details || null,
          mayContain: [],
          name: record.name,
          sourceKind: hasOfficialSignals ? "pdf-matrix" : "pdf-menu-matrix",
          sourceUrl: url,
          variantGroup: record.category,
        });
      })
      .filter((record) => record.name && isProbablyMenuItemName(record.name)),
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );
}

function genericPdfAllergenColumnsByPage(rows) {
  const byPage = new Map();

  for (const row of rows) {
    const columns = genericPdfAllergenColumnsFromRow(row);

    if (columns.length < 2) {
      continue;
    }

    const existing = byPage.get(row.pageNumber) ?? [];
    byPage.set(row.pageNumber, mergeGenericMatrixColumns(existing, columns));
  }

  const result = new Map();

  for (const [pageNumber, columns] of byPage) {
    const allergenColumns = mergeGenericMatrixColumns([], columns)
      .filter((column) => column.x >= 120)
      .sort((left, right) => left.x - right.x);

    if (allergenColumns.length < 2) {
      continue;
    }

    result.set(pageNumber, {
      columns: allergenColumns,
      firstX: Math.min(...allergenColumns.map((column) => column.x)),
      lastX: Math.max(...allergenColumns.map((column) => column.x)),
    });
  }

  return result;
}

function genericPdfAllergenColumnsFromRow(row) {
  const columns = [];

  for (const item of row.items) {
    if (item.x < 120) {
      continue;
    }

    const allergen = genericMatrixHeaderAllergen(item.str);

    if (allergen) {
      columns.push({ allergen, x: item.x });
    }
  }

  return columns;
}

function mergeGenericMatrixColumns(existing, incoming) {
  const merged = [...existing];

  for (const column of incoming) {
    const current = merged.find(
      (entry) =>
        entry.allergen === column.allergen &&
        Math.abs(entry.x - column.x) <= 12,
    );

    if (!current) {
      merged.push(column);
    }
  }

  return merged;
}

function genericMatrixHeaderAllergen(value) {
  return genericMatrixHeaderAllergens(value)[0] ?? null;
}

function genericMatrixHeaderAllergens(value) {
  const text = cleanText(value)
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  if (!text || /\bFREE\b/.test(text)) {
    return [];
  }

  if (/^(?:MILK|LECHE)$/.test(text)) return ["milk"];
  if (/^(?:EGG|EGGS|HUEVOS)$/.test(text)) return ["egg"];
  if (/^(?:FISH|PESCADO)$/.test(text)) return ["fish"];
  if (/^(?:SHELLFISH|CRUSTACEAN SHELLFISH|MOLLUSCAN SHELLFISH)$/.test(text))
    return ["shellfish"];
  if (/^(?:TREE NUTS|TREE NUT|FRUTOS SECOS|NUTS)$/.test(text))
    return ["tree-nut"];
  if (/^(?:PEANUTS|PEANUT|MANI)$/.test(text)) return ["peanut"];
  if (/^(?:WHEAT|TRIGO)$/.test(text)) return ["wheat"];
  if (/^(?:WHEAT GLUE?TEN|WHEAT GLUTEN)$/.test(text))
    return ["wheat", "gluten"];
  if (/^(?:SOY|SOYA)$/.test(text)) return ["soy"];
  if (/^(?:SESAME|SESAMO)$/.test(text)) return ["sesame"];
  if (/^GLUTEN$/.test(text)) return ["gluten"];

  return [];
}

function genericMatrixCellDetails(row, pageColumns) {
  return row.items
    .filter(
      (item) =>
        item.x >= pageColumns.firstX - 2 && item.x <= pageColumns.lastX + 40,
    )
    .map((item) => cleanGenericMatrixCellText(item.str))
    .filter(Boolean)
    .filter((text) => !genericMatrixHeaderAllergen(text))
    .filter((text) => !isGenericMatrixDietaryHeader(text));
}

function genericMatrixCellAllergens(row, pageColumns) {
  const allergens = [];

  for (const item of row.items) {
    if (item.x < pageColumns.firstX - 2 || item.x > pageColumns.lastX + 40) {
      continue;
    }

    const text = cleanGenericMatrixCellText(item.str);

    if (
      !isGenericMatrixAllergenCellEvidence(item.str) ||
      genericMatrixHeaderAllergen(text) ||
      isGenericMatrixDietaryHeader(text)
    ) {
      continue;
    }

    const column = closestGenericMatrixColumn(item.x, pageColumns.columns);

    if (column) {
      allergens.push(column.allergen);
    }
  }

  return uniqueStrings(allergens);
}

function closestGenericMatrixColumn(x, columns) {
  const closest = columns.reduce(
    (best, column) => {
      const distance = Math.abs(column.x - x);
      return distance < best.distance ? { column, distance } : best;
    },
    { column: null, distance: Number.POSITIVE_INFINITY },
  );

  return closest.distance <= 34 ? closest.column : null;
}

function cleanGenericMatrixCellText(value) {
  const text = cleanText(value);
  return text && !isGenericMatrixMarker(text) ? text : null;
}

function isGenericMatrixMarker(value) {
  return /^(?:[•●xX✓]+|Y|Yes)$/i.test(cleanText(value) ?? "");
}

export function isGenericMatrixAllergenCellEvidence(value) {
  const text = cleanText(value);

  if (!text) {
    return false;
  }

  if (isGenericMatrixMarker(text)) {
    return true;
  }

  if (/^(?:n|no|none|na|n\/a|not applicable|free|-|—|–)$/i.test(text)) {
    return false;
  }

  if (/\b(?:free|contains no|does not contain|not present)\b/i.test(text)) {
    return false;
  }

  if (/^[\d\s.,%/()<>+-]+$/.test(text)) {
    return false;
  }

  return /[a-z]/i.test(text);
}

function genericMatrixCategoryFromTitle(rowText) {
  const match = rowText.match(/\bMenu\s*-\s*(.+)$/i);

  if (!match) {
    return null;
  }

  return titleCase(
    match[1]
      .replace(/\bThis chart\b.*$/i, "")
      .replace(/\([^)]*\)\s*-\s*vegetarian.*$/i, "")
      .trim(),
  );
}

function normalizeGenericMatrixCategory(value) {
  const text = cleanText(value);

  if (!text || text.length > 45) {
    return null;
  }

  const upper = text.toUpperCase();

  if (
    /MENU ITEM|ALLERGEN|NUTRITION|DIETARY INFO/.test(upper) ||
    /^[()]/.test(text) ||
    /\)$/.test(text)
  ) {
    return null;
  }

  if (/^G.*IN BOWLS$|GRAIN BOWLS/.test(upper)) return "Grain Bowls";
  if (/^SA.*D BOWLS$|SALAD BOWLS/.test(upper)) return "Salad Bowls";
  if (/MIXED BOWLS/.test(upper)) return "Mixed Bowls";
  if (/^W.*PS$|WRAPS/.test(upper)) return "Wraps";
  if (/^SNAC.*SWEETS$|SNACKS? & SWEETS/.test(upper)) return "Snacks & Sweets";
  if (/^P.*TEINS$|PROTEINS/.test(upper)) return "Proteins";
  if (/BASES/.test(upper)) return "Bases";
  if (/TOPPINGS/.test(upper)) return "Toppings";
  if (/SAUCES/.test(upper)) return "Sauces";

  return isProbablyCategoryName(text) ? titleCase(text) : null;
}

function cleanGenericMatrixItemName(value) {
  return cleanMenuName(value)
    ?.replace(/\s*[✔✓●].*$/g, "")
    ?.replace(/^\+\s*/, "")
    ?.replace(
      /\s*\((?:used for|cannot be made|contains|with or without|Rosa Grande|Butter|Buttermilk|Cream|Cream Cheese|Sour|Soy|Oat|Corn|Walnuts?|Pesto|Tulkoff|Grey Poupon|Admiration Foods)[^)]*$/gi,
      "",
    )
    ?.replace(
      /\s*\((?:used for|contains|with or without|vegan!?)[^)]*\)?\s*/gi,
      " ",
    )
    ?.replace(/\s*\((?:V|VG|GF|DF|CN|SF|VT|PB|HH|LW)\)\s*/gi, " ")
    .replace(/\b(?:V|VG|GF|DF|CN|SF|VT|PB|HH|LW)\b$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isGenericMatrixContinuationOnly(value) {
  return /^(?:\((?:V|VG|GF|DF|CN|SF|VT|PB|HH|LW)\)|V|VG|GF|DF|CN|SF|VT|PB|HH|LW)$/i.test(
    cleanText(value) ?? "",
  );
}

function shouldJoinGenericMatrixName(previousName, nextName) {
  if (!previousName || !nextName) {
    return false;
  }

  if (/[+&]$/.test(previousName)) {
    return true;
  }

  if (
    /\b(?:bagel|bread|cookie|frosting|topping|sauce|salad|sandwich|wrap|bowl)$/i.test(
      nextName,
    )
  ) {
    return previousName.split(/\s+/).length <= 3;
  }

  return false;
}

function isGenericMatrixItemName(name) {
  if (!name || !isProbablyMenuItemName(name)) {
    return false;
  }

  if (/[+&]$/.test(name)) {
    return false;
  }

  const upper = name.toUpperCase();

  if (
    /^(?:DMV|ALLERGEN INFO|BUILD YOUR OWN|MENU ITEM|BASES|PROTEINS|P.*TEINS|TOPPINGS|SAUCES|GRAIN BOWLS|G.*IN BOWLS|SALAD BOWLS|SA.*D BOWLS|MIXED BOWLS|WRAPS|W.*PS|SNACKS? & SWEETS|SNAC.*SWEETS)$/i.test(
      upper,
    )
  ) {
    return false;
  }

  if (
    /^[✔✓●(]/.test(name) ||
    /^[a-z]/.test(name) ||
    /\b(?:allergen guide|used for|ask for|without the frosting|cannot be made|cross contamination warning|dairy-free|corn-free option)\b/i.test(
      name,
    ) ||
    /^[A-Za-z '&-]+\)$/.test(name)
  ) {
    return false;
  }

  return true;
}

function isGenericMatrixDietaryHeader(value) {
  const text = cleanText(value)?.toUpperCase() ?? "";
  return /VEGETA|VEGAN|GLUTEN\s*F|G.?.?TEN F|ALLIUM/.test(text);
}

async function extractBrandPdfItems(text, restaurant, url, buffer) {
  const profileRecords = await extractPdfDocumentSchemaProfileItems(
    text,
    restaurant,
    url,
    buffer,
  );

  if (profileRecords) {
    return profileRecords;
  }

  return extractLegacyRestaurantIdPdfItems(text, restaurant, url, buffer);
}

function shouldSkipGenericPdfFallbackForBrandDocument(text, restaurant, url) {
  const adapter = getBrandAdapter(restaurant.id);

  if (adapter.brandKey === "subway" && isSubwayIngredientPdf(text, url)) {
    return true;
  }

  if (
    adapter.brandKey === "nandosperiperi" &&
    /assets\.ctfassets\.net/i.test(url ?? "") &&
    !/Allergen[_-]?Guide|Allergen/i.test(url ?? "")
  ) {
    return true;
  }

  if (
    adapter.brandKey === "insomniacookies" &&
    /Insomnia|Nutrition|Allergen|Master/i.test(`${url ?? ""} ${text ?? ""}`)
  ) {
    return true;
  }

  return false;
}

async function extractPdfDocumentSchemaProfileItems(
  text,
  restaurant,
  url,
  buffer,
) {
  const adapter = getBrandAdapter(restaurant.id);
  const profile = documentSchemaProfiles.find((candidate) =>
    documentSchemaProfileMatches(candidate, {
      adapter,
      buffer,
      contentKind: "pdf",
      restaurant,
      text,
      url,
    }),
  );

  return profile ? profile.extract({ buffer, restaurant, text, url }) : null;
}

function documentSchemaProfileMatches(profile, context) {
  if (profile.contentKind && profile.contentKind !== context.contentKind) {
    return false;
  }

  if (
    profile.brandKeys &&
    !profile.brandKeys.includes(context.adapter.brandKey)
  ) {
    return false;
  }

  if (
    profile.parserProfiles &&
    !profile.parserProfiles.includes(context.adapter.parserProfile)
  ) {
    return false;
  }

  if (profile.sourceKinds && !profile.sourceKinds.includes(context.kind)) {
    return false;
  }

  if (profile.urlPattern && !profile.urlPattern.test(context.url)) {
    return false;
  }

  if (profile.textPattern && !profile.textPattern.test(context.text ?? "")) {
    return false;
  }

  if (profile.requiresBuffer && !context.buffer) {
    return false;
  }

  return profile.match ? profile.match(context) : true;
}

const documentSchemaProfiles = [
  {
    id: "pf-changs-html-allergen",
    brandKeys: ["pfchangs"],
    contentKind: "html",
    outputType: "official-allergen",
    sourceKinds: [sourceTypes.allergen],
    extract: ({ $, restaurant, url }) =>
      extractPfChangsAllergenItems($, restaurant, url),
  },
  {
    id: "nothing-bundt-cakes-html-ingredients",
    brandKeys: ["nothingbundtcakes"],
    contentKind: "html",
    outputType: "official-ingredients",
    sourceKinds: [sourceTypes.allergen],
    extract: ({ $, restaurant, url }) => {
      const nutritionItems = /\/nutrition\/?$/i.test(new URL(url).pathname)
        ? extractNothingBundtCakesNutritionItems($, restaurant, url)
        : [];
      return [
        ...nutritionItems,
        ...extractNothingBundtCakesIngredientItems($, restaurant, url),
      ];
    },
  },
  {
    id: "jenis-html-ingredients",
    brandKeys: ["jenis"],
    contentKind: "html",
    outputType: "official-ingredients",
    sourceKinds: [sourceTypes.allergen],
    urlPattern: /\/pages\/ingredients/i,
    extract: ({ $, restaurant, url }) =>
      extractJenisIngredientItems($, restaurant, url),
  },
  {
    id: "first-watch-html-nutrition-allergens",
    brandKeys: ["firstwatch"],
    contentKind: "html",
    outputType: "official-allergen",
    urlPattern: /\/nutrition-and-allergens/i,
    extract: ({ $, restaurant, url }) =>
      extractFirstWatchNutritionHtmlItems($, restaurant, url),
  },
  {
    id: "chick-fil-a-html-allergen",
    brandKeys: ["chick-fil-a"],
    contentKind: "html",
    outputType: "official-allergen",
    sourceKinds: [sourceTypes.allergen],
    extract: ({ $, restaurant, url }) =>
      extractChickFilAAllergenItems($, restaurant, url),
  },
  {
    id: "dairy-queen-html-allergen",
    brandKeys: ["dairyqueen"],
    contentKind: "html",
    outputType: "official-allergen",
    sourceKinds: [sourceTypes.allergen],
    extract: ({ $, restaurant, url }) =>
      extractDairyQueenAllergenItems($, restaurant, url),
  },
  {
    id: "freddys-html-allergen",
    brandKeys: ["freddys"],
    contentKind: "html",
    outputType: "official-allergen",
    sourceKinds: [sourceTypes.allergen],
    extract: ({ $, restaurant, url }) =>
      extractFreddysAllergenItems($, restaurant, url),
  },
  {
    id: "andpizza-html-menu",
    brandKeys: ["andpizza"],
    contentKind: "html",
    exclusive: true,
    outputType: "official-menu",
    sourceKinds: [sourceTypes.menu],
    urlPattern: /\/menu-listing\/?/i,
    extract: ({ $, restaurant, url }) =>
      extractAndPizzaMenuItems($, restaurant, url),
  },
  {
    id: "andpizza-html-allergen-guide",
    brandKeys: ["andpizza"],
    contentKind: "html",
    exclusive: true,
    outputType: "official-allergen",
    sourceKinds: [sourceTypes.allergen],
    urlPattern: /\/allergen-guide\/?/i,
    extract: ({ $, restaurant, url }) =>
      extractAndPizzaAllergenGuideItems($, restaurant, url),
  },
  {
    id: "in-n-out-html-nutrition",
    brandKeys: ["in-n-out"],
    contentKind: "html",
    outputType: "official-nutrition",
    urlPattern: /\/menu\/nutrition-info/i,
    extract: ({ $, restaurant, url }) =>
      extractInNOutNutritionHtmlItems($, restaurant, url),
  },
  {
    id: "papa-johns-html-nutrition",
    brandKeys: ["papajohns"],
    contentKind: "html",
    outputType: "official-nutrition",
    urlPattern: /\/company\/nutritional-details\//i,
    extract: ({ $, restaurant, url }) =>
      extractPapaJohnsNutritionItems($, restaurant, url),
  },
  {
    id: "papa-johns-html-allergen-guide",
    brandKeys: ["papajohns"],
    contentKind: "html",
    outputType: "official-allergen",
    urlPattern: /\/allergens\/papa-johns-allergen-guide\.html/i,
    extract: ({ $, restaurant, url }) =>
      extractPapaJohnsAllergenGuideItems($, restaurant, url),
  },
  {
    id: "dominos-xml-allergen",
    brandKeys: ["dominos"],
    contentKind: "xml",
    outputType: "official-allergen",
    sourceKinds: [sourceTypes.allergen],
    extract: ({ restaurant, text, url }) =>
      extractDominosAllergenXmlItems(text, restaurant, url),
  },
  {
    id: "dominos-xml-nutrition",
    brandKeys: ["dominos"],
    contentKind: "xml",
    outputType: "official-nutrition",
    sourceKinds: [sourceTypes.api],
    extract: ({ restaurant, text, url }) =>
      extractDominosNutritionXmlItems(text, restaurant, url),
  },
  {
    id: "founding-farmers-pdf-menu",
    brandKeys: ["founding-farmers"],
    contentKind: "pdf",
    outputType: "menu",
    parserProfiles: [sharedParserTypes.foundingFarmersPdfMenu],
    extract: ({ restaurant, text, url }) =>
      extractFoundingFarmersMenuPdfItems(text, restaurant, url),
  },
  {
    id: "mezeh-nutrition-allergen-pdf",
    brandKeys: ["mezeh"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    urlPattern: /nutrition[_-]info[_-]and[_-]allergen|allergen\.pdf|sping2025/i,
    extract: ({ buffer, restaurant, url }) =>
      extractMezehAllergenPdfItems(buffer, restaurant, url),
  },
  {
    id: "canva-fried-cross-contact-allergen-table-pdf",
    brandKeys: ["chasintailsss"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    textPattern:
      /ALLERGEN MENU \+ INGREDIENTS[\s\S]*ANYTHING FRIED WILL BE CONTAMINATED/i,
    extract: ({ buffer, restaurant, text, url }) =>
      extractChasinTailsAllergenPdfItems(buffer, restaurant, url, text),
  },
  {
    id: "osi-top-9-allergen-pdf",
    brandKeys: ["bonefishgrill", "carrabbas", "outback", "flemingssteakhouse"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    textPattern:
      /Top\s+9\s+Allergens[\s\S]*Y\s*=\s*YES\s+THE\s+ALLERGEN\s+IS\s+PRESENT/i,
    extract: ({ buffer, restaurant, url }) =>
      extractOsiTop9AllergenPdfItems(buffer, restaurant, url),
  },
  {
    id: "nandos-nutrition-allergen-pdf",
    brandKeys: ["nandosperiperi"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    urlPattern: /Allergen[_-]?Guide|Allergen/i,
    textPattern: /Nando.?s[\s\S]*(?:Contains|May Contain):/i,
    extract: ({ buffer, restaurant, url }) =>
      extractNandosNutritionAllergenPdfItems(buffer, restaurant, url),
  },
  {
    id: "rasa-allergy-chart-pdf",
    brandKeys: ["rasa"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    textPattern: /ALLERGY CHART[\s\S]*Dairy[\s\S]*Shellfish/i,
    extract: ({ buffer, restaurant, url }) =>
      extractRasaAllergyChartPdfItems(buffer, restaurant, url),
  },
  {
    id: "insomnia-cookies-nutrition-guide-pdf",
    brandKeys: ["insomniacookies"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    textPattern: /Insomnia Cookies[\s\S]*(?:CONTAINS:|ALLERGENS:\s*CONTAINS)/i,
    extract: ({ buffer, restaurant, url }) =>
      extractInsomniaCookiesNutritionGuidePdfItems(buffer, restaurant, url),
  },
  {
    id: "bbq-chicken-allergy-list-pdf",
    brandKeys: ["bbqchicken"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    textPattern: /Detailed Allergy List[\s\S]*POTENTIAL CROSS-CONTAMINANTS/i,
    extract: ({ buffer, restaurant, url }) =>
      extractBbqChickenAllergenPdfItems(buffer, restaurant, url),
  },
  {
    id: "dominos-nutrition-guide-pdf",
    brandKeys: ["dominos"],
    contentKind: "pdf",
    outputType: "official-nutrition",
    requiresBuffer: true,
    extract: ({ buffer, restaurant, url }) =>
      extractDominosNutritionGuidePdfItems(buffer, restaurant, url),
  },
  {
    id: "sonic-nutrition-brochure-pdf",
    brandKeys: ["sonicdrivein"],
    contentKind: "pdf",
    outputType: "official-nutrition",
    requiresBuffer: true,
    urlPattern: /NutritionalBrochure/i,
    extract: ({ buffer, restaurant, url }) =>
      extractSonicNutritionPdfItems(buffer, restaurant, url),
  },
  {
    id: "sonic-allergen-guide-pdf",
    brandKeys: ["sonicdrivein"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    urlPattern: /NationalAllergenGuide/i,
    extract: ({ buffer, restaurant, url }) =>
      extractSonicAllergenPdfItems(buffer, restaurant, url),
  },
  {
    id: "subway-nutrition-pdf",
    brandKeys: ["subway"],
    contentKind: "pdf",
    outputType: "official-nutrition",
    match: ({ text, url }) => isSubwayNutritionPdf(text, url),
    extract: ({ restaurant, text, url }) =>
      extractSubwayNutritionPdfItems(text, restaurant, url),
  },
  {
    id: "subway-ingredient-pdf-ignored",
    brandKeys: ["subway"],
    contentKind: "pdf",
    outputType: "official-ingredients",
    match: ({ text, url }) => isSubwayIngredientPdf(text, url),
    extract: () => [],
  },
  {
    id: "subway-allergen-matrix-pdf",
    brandKeys: ["subway"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    match: ({ text, url }) => isSubwayAllergenPdf(text, url),
    extract: ({ buffer, restaurant, url }) =>
      extractSubwayPdfItems(buffer, restaurant, url),
  },
  {
    id: "panda-express-pdf",
    brandKeys: ["pandaexpress"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    extract: ({ buffer, restaurant, url }) =>
      extractPandaExpressPdfItems(buffer, restaurant, url),
  },
  {
    id: "five-guys-pdf",
    brandKeys: ["fiveguys"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    extract: ({ buffer, restaurant, url }) =>
      extractFiveGuysPdfItems(buffer, restaurant, url),
  },
  {
    id: "zaxbys-pdf",
    brandKeys: ["zaxbys"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    extract: ({ buffer, restaurant, url }) =>
      extractZaxbysPdfItems(buffer, restaurant, url),
  },
  {
    id: "dunkin-allergy-ingredient-guide-pdf",
    brandKeys: ["dunkindonuts"],
    contentKind: "pdf",
    outputType: "official-ingredients",
    urlPattern: /allergy_ingredient_guide\.pdf/i,
    extract: ({ restaurant, text, url }) =>
      extractDunkinAllergyIngredientPdfItems(text, restaurant, url),
  },
  {
    id: "dunkin-nutrition-pdf",
    brandKeys: ["dunkindonuts"],
    contentKind: "pdf",
    outputType: "official-nutrition",
    requiresBuffer: true,
    urlPattern: /nutrition\.pdf/i,
    extract: ({ buffer, restaurant, url }) =>
      extractDunkinNutritionPdfItems(buffer, restaurant, url),
  },
  {
    id: "chipotle-paper-menu-nutrition-pdf",
    brandKeys: ["chipotle"],
    contentKind: "pdf",
    outputType: "official-nutrition",
    urlPattern: /Nutrition-Facts-Paper-Menu/i,
    extract: ({ restaurant, text, url }) =>
      extractChipotleNutritionPdfItems(text, restaurant, url),
  },
  {
    id: "panera-allergen-guide-pdf",
    brandKeys: ["panerabread"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    urlPattern: /allergen-guide/i,
    extract: ({ buffer, restaurant, url }) =>
      extractPaneraAllergenPdfItems(buffer, restaurant, url),
  },
  {
    id: "panera-nutrition-guide-pdf",
    brandKeys: ["panerabread"],
    contentKind: "pdf",
    outputType: "official-nutrition",
    requiresBuffer: true,
    urlPattern: /nutrition-guide/i,
    extract: ({ buffer, restaurant, url }) =>
      extractPaneraNutritionPdfItems(buffer, restaurant, url),
  },
  {
    id: "arbys-allergen-nutrition-pdf",
    brandKeys: ["arbys"],
    contentKind: "pdf",
    outputType: "official-allergen",
    urlPattern: /Nutritional_and_Allergen/i,
    extract: ({ restaurant, text, url }) =>
      extractArbysAllergenPdfItems(text, restaurant, url),
  },
  {
    id: "arbys-ingredients-pdf",
    brandKeys: ["arbys"],
    contentKind: "pdf",
    outputType: "official-ingredients",
    urlPattern: /Menu_Items_and_Ingredients/i,
    extract: ({ restaurant, text, url }) =>
      extractArbysIngredientsPdfItems(text, restaurant, url),
  },
  {
    id: "little-caesars-pdf",
    brandKeys: ["littlecaesars"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    extract: ({ buffer, restaurant, url }) =>
      extractLittleCaesarsPdfItems(buffer, restaurant, url),
  },
  {
    id: "wingstop-nutrition-guide-pdf",
    brandKeys: ["wingstop"],
    contentKind: "pdf",
    outputType: "official-nutrition",
    requiresBuffer: true,
    urlPattern: /NutritionalGuide/i,
    extract: ({ buffer, restaurant, url }) =>
      extractWingstopNutritionPdfItems(buffer, restaurant, url),
  },
  {
    id: "wingstop-allergen-pdf",
    brandKeys: ["wingstop"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    extract: ({ buffer, restaurant, url }) =>
      extractWingstopPdfItems(buffer, restaurant, url),
  },
  {
    id: "darden-olive-garden-allergen-pdf",
    brandKeys: ["olivegarden"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    urlPattern: /allergen_guide/i,
    extract: ({ buffer, restaurant, url }) =>
      extractOliveGardenAllergenPdfItems(buffer, restaurant, url),
  },
  {
    id: "darden-olive-garden-nutrition-pdf",
    brandKeys: ["olivegarden"],
    contentKind: "pdf",
    outputType: "official-nutrition",
    urlPattern: /olive_garden_nutrition/i,
    extract: ({ restaurant, text, url }) =>
      extractTrailingNutritionTextPdfItems(text, restaurant, url, {
        description: "Official Olive Garden nutrition PDF.",
      }),
  },
  {
    id: "darden-longhorn-allergen-pdf",
    brandKeys: ["longhornsteakhouse"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    urlPattern: /longhorn_allergen_guide/i,
    extract: ({ buffer, restaurant, url }) =>
      extractLongHornAllergenPdfItems(buffer, restaurant, url),
  },
  {
    id: "darden-longhorn-nutrition-pdf",
    brandKeys: ["longhornsteakhouse"],
    contentKind: "pdf",
    outputType: "official-nutrition",
    urlPattern: /longhorn_steakhouse_nutrition/i,
    extract: ({ restaurant, text, url }) =>
      extractTrailingNutritionTextPdfItems(text, restaurant, url, {
        description: "Official LongHorn Steakhouse nutrition PDF.",
      }),
  },
  {
    id: "darden-yard-house-allergen-pdf",
    brandKeys: ["yardhouse"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    urlPattern: /Yard_House_Allergen_Guide/i,
    extract: ({ buffer, restaurant, url }) =>
      extractYardHouseAllergenPdfItems(buffer, restaurant, url),
  },
  {
    id: "darden-yard-house-nutrition-pdf",
    brandKeys: ["yardhouse"],
    contentKind: "pdf",
    outputType: "official-nutrition",
    requiresBuffer: true,
    urlPattern: /Nutrition_Dietary_Allergen_Guide/i,
    extract: ({ buffer, restaurant, url }) =>
      extractYardHouseNutritionPdfItems(buffer, restaurant, url),
  },
  {
    id: "darden-cheddars-allergen-pdf",
    brandKeys: ["cheddars"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    urlPattern: /Cheddars_Allergen_Guide/i,
    extract: ({ buffer, restaurant, url }) =>
      extractCheddarsAllergenPdfItems(buffer, restaurant, url),
  },
  {
    id: "darden-cheddars-nutrition-pdf",
    brandKeys: ["cheddars"],
    contentKind: "pdf",
    outputType: "official-nutrition",
    requiresBuffer: true,
    urlPattern: /Cheddars_Nutrition_Guide/i,
    extract: ({ buffer, restaurant, url }) =>
      extractCheddarsNutritionPdfItems(buffer, restaurant, url),
  },
  {
    id: "osi-outback-allergen-pdf",
    brandKeys: ["outback"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    urlPattern: /Full-Allergens-Information/i,
    extract: ({ buffer, restaurant, url }) =>
      extractOutbackAllergenPdfItems(buffer, restaurant, url),
  },
  {
    id: "osi-outback-nutrition-pdf",
    brandKeys: ["outback"],
    contentKind: "pdf",
    outputType: "official-nutrition",
    urlPattern: /Full_Nutrition_Information|Nutrition_Information/i,
    extract: ({ restaurant, text, url }) =>
      extractTrailingNutritionTextPdfItems(text, restaurant, url, {
        description: "Official Outback Steakhouse nutrition PDF.",
      }),
  },
  {
    id: "cke-nutrition-code-pdf",
    brandKeys: ["carlsjr", "hardees"],
    contentKind: "pdf",
    outputType: "official-nutrition",
    textPattern: /nutrition/i,
    extract: ({ restaurant, text, url }) =>
      extractCkeNutritionCodePdfItems(text, restaurant, url),
  },
  {
    id: "tropical-smoothie-nutrition-allergen-pdf",
    brandKeys: ["tropicalsmoothiecafe"],
    contentKind: "pdf",
    outputType: "official-allergen",
    textPattern: /Contains egg[\s\S]*Contains sesame/i,
    extract: ({ restaurant, text, url }) =>
      extractTropicalSmoothieNutritionPdfItems(text, restaurant, url),
  },
  {
    id: "generic-trailing-nutrition-text-pdf",
    brandKeys: [
      "crackerbarrel",
      "buffalowildwings",
      "dennys",
      "tropicalsmoothiecafe",
      "qdoba",
      "pfchangs",
    ],
    contentKind: "pdf",
    outputType: "official-nutrition",
    urlPattern:
      /Nutrition|nutrition|nutrition-information|national-menu-nutrition/i,
    extract: ({ restaurant, text, url }) =>
      extractTrailingNutritionTextPdfItems(text, restaurant, url, {
        description: `Official ${restaurant.name} nutrition PDF.`,
      }),
  },
  {
    id: "generic-statement-allergen-nutrition-pdf",
    contentKind: "pdf",
    outputType: "official-allergen",
    textPattern: /Allergen Statement:\s*(?:Contains|Does not contain)/i,
    urlPattern: /nutrition|nutritional/i,
    extract: ({ restaurant, text, url }) =>
      extractStatementAllergenNutritionPdfItems(text, restaurant, url, {
        description: `Official ${restaurant.name} nutrition and allergen PDF.`,
      }),
  },
  {
    id: "first-watch-allergen-guide-pdf",
    brandKeys: ["firstwatch"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    urlPattern: /allergenguide/i,
    extract: ({ buffer, restaurant, url }) =>
      extractFirstWatchAllergenPdfItems(buffer, restaurant, url),
  },
  {
    id: "cracker-barrel-allergen-guide-pdf",
    brandKeys: ["crackerbarrel"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    urlPattern: /AllergenGuide\.pdf/i,
    extract: ({ buffer, restaurant, url }) =>
      extractCrackerBarrelAllergenPdfItems(buffer, restaurant, url),
  },
  {
    id: "buffalo-wild-wings-allergen-pdf",
    brandKeys: ["buffalowildwings"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    urlPattern: /BWW_Allergen/i,
    extract: ({ buffer, restaurant, url }) =>
      extractBuffaloWildWingsAllergenPdfItems(buffer, restaurant, url),
  },
  {
    id: "red-lobster-allergen-guide-pdf",
    brandKeys: ["redlobster"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    urlPattern: /Allergen.*Guide/i,
    extract: ({ buffer, restaurant, url }) =>
      extractRedLobsterAllergenPdfItems(buffer, restaurant, url),
  },
  {
    id: "red-lobster-nutrition-pdf",
    brandKeys: ["redlobster"],
    contentKind: "pdf",
    outputType: "official-nutrition",
    requiresBuffer: true,
    urlPattern: /US_Nutrit/i,
    extract: ({ buffer, restaurant, url }) =>
      extractRedLobsterNutritionPdfItems(buffer, restaurant, url),
  },
  {
    id: "dennys-allergen-guide-pdf",
    brandKeys: ["dennys"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    urlPattern: /AllergenGuide/i,
    extract: ({ buffer, restaurant, url }) =>
      extractDennysAllergenPdfItems(buffer, restaurant, url),
  },
  {
    id: "waffle-house-menu-nutritionals-pdf",
    brandKeys: ["wafflehouse"],
    contentKind: "pdf",
    outputType: "official-nutrition",
    urlPattern: /Menu-Nutritionals/i,
    extract: ({ restaurant, text, url }) =>
      extractWaffleHouseNutritionPdfItems(text, restaurant, url),
  },
  {
    id: "jack-in-the-box-nutrition-pdf",
    brandKeys: ["jackinthebox"],
    contentKind: "pdf",
    outputType: "official-nutrition",
    requiresBuffer: true,
    match: ({ text, url }) =>
      /\b(?:nutrition|nutritional|Nutrition_Facts)\b/i.test(url) ||
      /NUTRITION FACTS/i.test(text ?? ""),
    extract: ({ buffer, restaurant, url }) =>
      extractJackInTheBoxNutritionPdfItems(buffer, restaurant, url),
  },
  {
    id: "jack-in-the-box-allergen-pdf",
    brandKeys: ["jackinthebox"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    extract: ({ buffer, restaurant, url }) =>
      extractJackInTheBoxPdfItems(buffer, restaurant, url),
  },
  {
    id: "raising-canes-pdf",
    brandKeys: ["raisingcanes"],
    contentKind: "pdf",
    outputType: "official-allergen",
    extract: ({ restaurant, text, url }) =>
      extractRaisingCanesPdfItems(text, restaurant, url),
  },
  {
    id: "in-n-out-pdf",
    brandKeys: ["in-n-out"],
    contentKind: "pdf",
    outputType: "official-allergen",
    extract: ({ restaurant, text, url }) =>
      extractInNOutPdfItems(text, restaurant, url),
  },
  {
    id: "el-pollo-loco-nutrition-pdf",
    brandKeys: ["elpolloloco"],
    contentKind: "pdf",
    outputType: "official-nutrition",
    requiresBuffer: true,
    extract: ({ buffer, restaurant, url }) =>
      extractElPolloLocoNutritionPdfItems(buffer, restaurant, url),
  },
  {
    id: "bjs-allergen-pdf",
    brandKeys: ["bjsrestaurants"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    urlPattern: /GLUTEN_ALLERGEN/i,
    extract: ({ buffer, restaurant, url }) =>
      extractBjsAllergenPdfItems(buffer, restaurant, url),
  },
  {
    id: "bjs-nutrition-pdf",
    brandKeys: ["bjsrestaurants"],
    contentKind: "pdf",
    outputType: "official-nutrition",
    requiresBuffer: true,
    urlPattern: /BJS_NUTRI/i,
    extract: ({ buffer, restaurant, url }) =>
      extractBjsNutritionPdfItems(buffer, restaurant, url),
  },
  {
    id: "qdoba-allergen-pdf",
    brandKeys: ["qdoba"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    match: ({ url }) => !/nutrition-information/i.test(url),
    extract: ({ buffer, restaurant, url }) =>
      extractQdobaAllergenPdfItems(buffer, restaurant, url),
  },
  {
    id: "del-taco-nutrition-pdf",
    brandKeys: ["deltaco"],
    contentKind: "pdf",
    outputType: "official-nutrition",
    urlPattern: /nutritional-\d{2}-\d{4}\.pdf/i,
    extract: ({ restaurant, text, url }) =>
      extractTrailingNutritionTextPdfItems(text, restaurant, url, {
        description: "Official Del Taco nutritional list PDF.",
      }),
  },
  {
    id: "del-taco-allergen-pdf",
    brandKeys: ["deltaco"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    urlPattern: /allergens-\d{2}-\d{4}\.pdf/i,
    extract: ({ buffer, restaurant, url }) =>
      extractDelTacoAllergenPdfItems(buffer, restaurant, url),
  },
  {
    id: "cava-allergen-pdf",
    brandKeys: ["cava"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    urlPattern: /AllergReg\.pdf/i,
    extract: ({ buffer, restaurant, url }) =>
      extractCavaAllergenPdfItems(buffer, restaurant, url),
  },
  {
    id: "auntie-annes-nutrition-pdf",
    brandKeys: ["auntieannes"],
    contentKind: "pdf",
    outputType: "official-nutrition",
    requiresBuffer: true,
    urlPattern: /Nutrition-Guide/i,
    extract: ({ buffer, restaurant, url }) =>
      extractAuntieAnnesNutritionPdfItems(buffer, restaurant, url),
  },
  {
    id: "auntie-annes-allergen-pdf",
    brandKeys: ["auntieannes"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    urlPattern: /Food-Allergens-and-Sensitivities-Chart\.pdf/i,
    extract: ({ buffer, restaurant, url }) =>
      extractAuntieAnnesAllergenPdfItems(buffer, restaurant, url),
  },
  {
    id: "tim-hortons-allergen-guide-pdf",
    brandKeys: ["timhortons"],
    contentKind: "pdf",
    outputType: "official-allergen",
    requiresBuffer: true,
    urlPattern: /Allergen-Guide/i,
    extract: ({ buffer, restaurant, url }) =>
      extractTimHortonsAllergenPdfItems(buffer, restaurant, url),
  },
  {
    id: "dutch-bros-nutrition-pdf",
    brandKeys: ["dutchbros"],
    contentKind: "pdf",
    outputType: "official-nutrition",
    requiresBuffer: true,
    urlPattern: /nutrition/i,
    extract: ({ buffer, restaurant, url }) =>
      extractDutchBrosNutritionPdfItems(buffer, restaurant, url),
  },
  {
    id: "shake-shack-nutrition-allergen-pdf",
    brandKeys: ["shakeshack"],
    contentKind: "pdf",
    outputType: "official-allergen",
    urlPattern: /Master.*Nut.*Allergen|document\/3481/i,
    extract: ({ restaurant, text, url }) =>
      extractShakeShackNutritionAllergenPdfItems(text, restaurant, url),
  },
];

export const documentSchemaProfileMigrationReport = {
  migratedProfileIds: documentSchemaProfiles.map((profile) => profile.id),
  officialApiProfileIds: officialApiDocumentSchemaProfiles.map(
    (profile) => profile.id,
  ),
  supplementalSourceProfileIds: supplementalSourceProfiles.map(
    (profile) => profile.id,
  ),
  emptyPdfQuarantine: "extractLegacyRestaurantIdPdfItems",
  remainingRestaurantIdExtractorSurfaces: [],
};

async function extractLegacyRestaurantIdPdfItems(
  text,
  restaurant,
  url,
  buffer,
) {
  void text;
  void restaurant;
  void url;
  void buffer;
  return [];
}

function extractFoundingFarmersMenuPdfItems(text, restaurant, url) {
  const category = foundingFarmersCategoryFromUrl(url, restaurant.category);
  const lines = text
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((line) => cleanText(line?.replace(/\t+/g, " ")))
    .filter(Boolean);
  const records = [];
  let pending = null;
  let namePrefix = null;

  for (const line of lines) {
    if (isFoundingFarmersNonMenuLine(line)) {
      namePrefix = null;
      continue;
    }

    const item = parseFoundingFarmersPricedLine(line);

    if (item) {
      if (pending && item.name.startsWith("&")) {
        const prefix = pending.descriptionLines.at(-1);

        if (prefix && isFoundingFarmersNameContinuation(prefix)) {
          pending.descriptionLines.pop();
          item.name = cleanFoundingFarmersMenuName(`${prefix} ${item.name}`);
        }
      }
      flushPending();
      if (namePrefix && shouldPrefixFoundingFarmersItem(item.name)) {
        item.name = cleanFoundingFarmersMenuName(`${namePrefix} ${item.name}`);
      }
      pending = item;
      namePrefix = null;
      continue;
    }

    if (
      pending?.name.endsWith("&") &&
      line.length <= 60 &&
      !parseFoundingFarmersPricedLine(line) &&
      !isFoundingFarmersHeading(line) &&
      !isFoundingFarmersNonMenuLine(line)
    ) {
      pending.name = cleanFoundingFarmersMenuName(`${pending.name} ${line}`);
      continue;
    }

    if (isFoundingFarmersHeading(line)) {
      namePrefix = null;
      continue;
    }

    if (!pending && isFoundingFarmersNameContinuation(line)) {
      namePrefix = line;
      continue;
    }

    if (!pending) {
      continue;
    }

    if (
      pending.descriptionLines.length < 5 &&
      isFoundingFarmersDescriptionLine(line)
    ) {
      pending.descriptionLines.push(line);
    }
  }

  flushPending();

  return records;

  function flushPending() {
    if (!pending) {
      return;
    }

    const description =
      pending.descriptionLines.join(" ") ||
      `Official Founding Farmers DC ${category.toLowerCase()} menu item.`;

    if (isProbablyMenuItemName(pending.name)) {
      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.unavailable,
          allergens: [],
          category,
          description,
          evidenceText: `${pending.name} ${description}`,
          imageUrl: null,
          ingredientsText: null,
          mayContain: [],
          name: pending.name,
          sourceKind: "pdf-menu",
          sourceUrl: url,
          variantGroup: category,
        }),
      );
    }

    pending = null;
  }
}

async function extractCanvaFriedCrossContactAllergenTablePdfItems(
  buffer,
  restaurant,
  url,
  text,
) {
  const tables = await readPdfTables(buffer);

  return extractFriedCrossContactAllergenTableItems(
    tables,
    restaurant,
    url,
    text,
  );
}

export async function extractOsiTop9AllergenPdfItems(buffer, restaurant, url) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 6);
  const records = [];
  const rowsByPage = new Map();

  for (const row of rows) {
    rowsByPage.set(row.pageNumber, [
      ...(rowsByPage.get(row.pageNumber) ?? []),
      row,
    ]);
  }

  let currentCategory = restaurant.category;

  for (const pageRows of rowsByPage.values()) {
    const headerRow = pageRows.find((row) => {
      const text = row.items.map((item) => item.str).join(" ");
      return (
        /\bMenu Item Name\b/i.test(text) &&
        /\bEggs\b/i.test(text) &&
        /\bWheat\b/i.test(text)
      );
    });

    if (!headerRow) {
      continue;
    }

    const columns = osiTop9HeaderColumns(headerRow);

    if (columns.length < 7) {
      continue;
    }

    let currentCategory = restaurant.category;

    for (const row of pageRows.sort((left, right) => right.y - left.y)) {
      if (row.y >= headerRow.y) {
        continue;
      }

      const rowText = cleanText(row.items.map((item) => item.str).join(" "));

      if (
        !rowText ||
        /^Y\s*=\s*YES\b/i.test(rowText) ||
        /^Created:/i.test(rowText)
      ) {
        continue;
      }

      const markerItems = row.items.filter(
        (item) => /^Y$/i.test(item.str) && item.x >= columns[0].x - 24,
      );
      const name = cleanMenuName(
        row.items
          .filter(
            (item) => item.x < columns[0].x - 32 && !/^Y$/i.test(item.str),
          )
          .map((item) => item.str)
          .join(" "),
      );

      if (!name) {
        continue;
      }

      if (
        markerItems.length === 0 &&
        isOsiTop9SectionHeading(name) &&
        !isProbablyMenuItemName(name)
      ) {
        currentCategory = normalizeOsiTop9Category(name);
        continue;
      }

      if (
        markerItems.length === 0 &&
        row.items.length <= 2 &&
        row.items.every((item) => item.x < 120) &&
        isOsiTop9SectionHeading(name)
      ) {
        currentCategory = normalizeOsiTop9Category(name);
        continue;
      }

      if (!isGenericMatrixItemName(name)) {
        continue;
      }

      if (/\b(?:and|or|with)$/i.test(name)) {
        continue;
      }

      const allergens = uniqueStrings(
        markerItems
          .map((item) => nearestOsiTop9Column(item.x, columns)?.allergen)
          .filter(Boolean),
      );

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens,
          category: currentCategory,
          description: `${restaurant.name} official Top 9 allergen matrix.`,
          evidenceText:
            allergens.length > 0
              ? `${restaurant.name} official allergen row: ${name}: ${allergens.join(", ")}.`
              : `${restaurant.name} official allergen row: ${name}: no Top 9 allergen markers listed.`,
          imageUrl: null,
          ingredientsText: null,
          mayContain: [],
          name,
          sourceKind: "pdf-matrix",
          sourceUrl: url,
          variantGroup: currentCategory,
        }),
      );
    }
  }

  return uniqueBy(
    records.filter(
      (record) => record.name && isProbablyMenuItemName(record.name),
    ),
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );
}

function osiTop9HeaderColumns(headerRow) {
  const columns = [];
  const labelMap = [
    { allergen: "egg", pattern: /^eggs?$/i },
    { allergen: "fish", pattern: /^fish$/i },
    { allergen: "milk", pattern: /^milk$/i },
    { allergen: "peanut", pattern: /^peanuts?$/i },
    { allergen: "sesame", pattern: /^sesame$/i },
    { allergen: "shellfish", pattern: /^shellfish$/i },
    { allergen: "soy", pattern: /^soy(?:bean)?$/i },
    { allergen: "tree-nut", pattern: /^tree\s*nuts?$|^treenuts?$/i },
    { allergen: "wheat", pattern: /^wheat$/i },
  ];

  for (const item of headerRow.items) {
    const text = cleanText(item.str);
    const match = labelMap.find((candidate) =>
      candidate.pattern.test(text ?? ""),
    );

    if (match) {
      columns.push({ allergen: match.allergen, x: item.x });
    }
  }

  return uniqueBy(
    columns.sort((left, right) => left.x - right.x),
    (column) => column.allergen,
  );
}

function nearestOsiTop9Column(x, columns) {
  return columns.reduce(
    (best, column) => {
      const distance = Math.abs(column.x - x);
      return distance < best.distance ? { column, distance } : best;
    },
    { column: null, distance: Number.POSITIVE_INFINITY },
  ).column;
}

function isOsiTop9SectionHeading(value) {
  const text = cleanText(value);

  if (!text || text.length > 80) {
    return false;
  }

  return /^(?:Category\s*)?(?:Starters?(?:\s*&\s*Soups?)?|Sharing|Starters\s*&\s*Sharing|Soups?\s*&\s*Greens|Market Salads?\s*&\s*Classic Soups?|Entree Salads?\s*&\s*Bowls?|Signature Sandwiches|Prix Fixe|Perfect Pairings|Chef Inspired Selections|Simply Grilled|Signature Vegetables|Signature Steaks|Shareable Sides|Social Hour|Tomahawk Tuesday|From the Sea|From the Land|Add To Any Entr[eé]e|Premium Sides|Desserts?|Brunch|Kids|Lunch|Dinner|Family Bundles?|Catering|Chicken|Pasta|Pizza|Seafood|Steaks?|Sides?)\b/i.test(
    text,
  );
}

function normalizeOsiTop9Category(value) {
  const text = cleanText(value);

  if (/^Add To Any Entr/i.test(text ?? "")) {
    return "Add To Any Entree";
  }

  return titleCase(text);
}

export async function extractNandosNutritionAllergenPdfItems(
  buffer,
  restaurant,
  url,
) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 4);
  const records = [];
  const itemRows = rows
    .map((row) => {
      const categoryText = cleanText(
        row.items.find((item) => item.x >= 30 && item.x < 95)?.str,
      );
      const nameText = cleanMenuName(
        row.items.find((item) => item.x >= 95 && item.x < 245)?.str,
      );

      if (!categoryText || !nameText || !isGenericMatrixItemName(nameText)) {
        return null;
      }

      if (
        /^(?:Category|Allergy Caution|Adults and youth)$/i.test(categoryText)
      ) {
        return null;
      }

      return {
        category: normalizeNandosCategory(categoryText),
        name: nameText,
        row,
      };
    })
    .filter(Boolean)
    .sort((left, right) =>
      left.row.pageNumber === right.row.pageNumber
        ? right.row.y - left.row.y
        : left.row.pageNumber - right.row.pageNumber,
    );

  for (let index = 0; index < itemRows.length; index += 1) {
    const itemRow = itemRows[index];
    const previous = itemRows[index - 1];
    const next = itemRows[index + 1];
    const upperBound =
      previous && previous.row.pageNumber === itemRow.row.pageNumber
        ? (previous.row.y + itemRow.row.y) / 2
        : itemRow.row.y + 18;
    const lowerBound =
      next && next.row.pageNumber === itemRow.row.pageNumber
        ? (itemRow.row.y + next.row.y) / 2
        : itemRow.row.y - 18;
    const bandRows = rows.filter(
      (row) =>
        row.pageNumber === itemRow.row.pageNumber &&
        row.y < upperBound &&
        row.y > lowerBound,
    );
    const allergenText = cleanText(
      bandRows
        .flatMap((row) => row.items)
        .filter((item) => item.x >= 555)
        .map((item) => item.str)
        .join(" "),
    );
    const directText = extractNandosDisclosure(allergenText, "contains");
    const mayText = extractNandosDisclosure(allergenText, "may");
    const allergens = normalizeProviderAllergens(
      directText ? [directText] : [],
    );
    const mayContain = uniqueStrings(
      normalizeProviderAllergens(mayText ? [mayText] : []).filter(
        (allergen) => !allergens.includes(allergen),
      ),
    );

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: itemRow.category,
        description: "Official Nando's nutrition and allergen guide.",
        evidenceText:
          allergenText ??
          `Official Nando's allergen row: ${itemRow.name}: no allergen disclosure listed in the allergen column.`,
        imageUrl: null,
        ingredientsText: null,
        mayContain,
        name: itemRow.name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: itemRow.category,
      }),
    );
  }

  return uniqueBy(
    records.filter(
      (record) => record.name && isProbablyMenuItemName(record.name),
    ),
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );
}

function extractNandosDisclosure(value, type) {
  const text = cleanText(value);

  if (!text) {
    return null;
  }

  const pattern =
    type === "contains"
      ? /(?<!May\s)\bContains?:\s*([\s\S]*?)(?=\b(?:May\s+Contain:|Contains?:)|$)/gi
      : /\bMay\s+Contain:\s*([\s\S]*?)(?=\b(?:May\s+Contain:|Contains?:)|$)/gi;
  const parts = [...text.matchAll(pattern)]
    .map((match) => cleanText(match[1]))
    .filter(Boolean);

  return cleanText(parts.join(", "));
}

function normalizeNandosCategory(value) {
  const text = cleanText(value);

  if (/^Nandinos/i.test(text ?? "")) {
    return "Nandinos";
  }

  return titleCase(text);
}

export async function extractRasaAllergyChartPdfItems(buffer, restaurant, url) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 4);
  const records = [];
  const rowsByPage = new Map();

  for (const row of rows) {
    rowsByPage.set(row.pageNumber, [
      ...(rowsByPage.get(row.pageNumber) ?? []),
      row,
    ]);
  }

  let currentCategory = restaurant.category;

  for (const pageRows of rowsByPage.values()) {
    const headerRow = pageRows.find((row) => {
      const text = row.items.map((item) => item.str).join(" ");
      return /\bDairy\b/i.test(text) && /\bShellfish\b/i.test(text);
    });

    if (!headerRow) {
      continue;
    }

    const columns = rasaAllergyChartColumns(headerRow);
    const itemRows = pageRows
      .map((row) => {
        const leftItems = row.items.filter(
          (item) => item.x < 130 && !/^x$/i.test(item.str),
        );
        const name = cleanMenuName(leftItems.map((item) => item.str).join(" "));

        if (!name || /^ALLERGY CHART|Updated/i.test(name)) {
          return null;
        }

        const hasMarkers = row.items.some(
          (item) => /^x$/i.test(item.str) && item.x >= 130,
        );

        if (!hasMarkers && isRasaAllergySectionHeading(name)) {
          currentCategory = titleCase(name.replace(/\s*\+\s*/g, " + "));
          return null;
        }

        if (!isGenericMatrixItemName(name)) {
          return null;
        }

        return {
          category: currentCategory,
          name: normalizeRasaAllergyName(name),
          row,
        };
      })
      .filter(Boolean)
      .sort((left, right) => right.row.y - left.row.y);

    for (let index = 0; index < itemRows.length; index += 1) {
      const itemRow = itemRows[index];
      const previous = itemRows[index - 1];
      const next = itemRows[index + 1];
      const upperBound = previous
        ? (previous.row.y + itemRow.row.y) / 2
        : itemRow.row.y + 16;
      const lowerBound = next
        ? (itemRow.row.y + next.row.y) / 2
        : itemRow.row.y - 16;
      const bandRows = pageRows.filter(
        (row) => row.y < upperBound && row.y > lowerBound,
      );
      const allergens = uniqueStrings(
        bandRows
          .flatMap((row) => row.items)
          .filter((item) => /^x$/i.test(item.str))
          .flatMap(
            (item) =>
              nearestRasaAllergyColumn(item.x, columns)?.allergens ?? [],
          )
          .filter(Boolean),
      );

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens,
          category: itemRow.category,
          description: "Official RASA allergy chart.",
          evidenceText:
            allergens.length > 0
              ? `Official RASA allergy chart row: ${itemRow.name}: ${allergens.join(", ")}.`
              : `Official RASA allergy chart row: ${itemRow.name}: no supported app allergens marked.`,
          imageUrl: null,
          ingredientsText: null,
          mayContain: [],
          name: itemRow.name,
          sourceKind: "pdf-matrix",
          sourceUrl: url,
          variantGroup: itemRow.category,
        }),
      );
    }
  }

  return uniqueBy(
    records.filter(
      (record) => record.name && isProbablyMenuItemName(record.name),
    ),
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );
}

function rasaAllergyChartColumns(headerRow) {
  const map = [
    { allergens: ["milk"], pattern: /^Dairy$/i },
    { allergens: ["egg"], pattern: /^Eggs$/i },
    { allergens: ["wheat"], pattern: /^Wheat$/i },
    { allergens: ["peanut", "tree-nut"], pattern: /^Nuts$/i },
    { allergens: ["soy"], pattern: /^Soy$/i },
    { allergens: ["sesame"], pattern: /^Sesame$/i },
    { allergens: ["shellfish"], pattern: /^Shellfish$/i },
  ];

  return headerRow.items
    .map((item) => {
      const match = map.find((candidate) => candidate.pattern.test(item.str));
      return match ? { allergens: match.allergens, x: item.x } : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.x - right.x);
}

function nearestRasaAllergyColumn(x, columns) {
  const nearest = columns.reduce(
    (best, column) => {
      const distance = Math.abs(column.x - x);
      return distance < best.distance ? { column, distance } : best;
    },
    { column: null, distance: Number.POSITIVE_INFINITY },
  );

  return nearest.distance <= 24 ? nearest.column : null;
}

function isRasaAllergySectionHeading(value) {
  return /^(?:BASES|MAINS|SAUCE|VEGGIES|TOPPINGS|DRESSINGS\s*\+\s*CHUTNEYS|CRUNCH|SIDES\s*\+\s*SWEETS)$/i.test(
    cleanText(value) ?? "",
  );
}

function normalizeRasaAllergyName(value) {
  return cleanMenuName(value)?.replace(/\bSace\b/i, "Sauce") ?? value;
}

export async function extractInsomniaCookiesNutritionGuidePdfItems(
  buffer,
  restaurant,
  url,
) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 4);
  const rowsByPage = new Map();
  const records = [];

  for (const row of rows) {
    rowsByPage.set(row.pageNumber, [
      ...(rowsByPage.get(row.pageNumber) ?? []),
      row,
    ]);
  }

  for (const [pageNumber, pageRows] of rowsByPage) {
    const sortedRows = [...pageRows].sort((left, right) => right.y - left.y);
    const pageText = sortedRows.map(insomniaPdfRowText).join("\n");

    if (
      !/\bINGREDIENTS?\b/i.test(pageText) ||
      !/(?:\bCONTAINS:|\bALLERGENS:\s*CONTAINS\b)/i.test(pageText)
    ) {
      continue;
    }

    const ingredientRow = sortedRows.find((row) =>
      /\bINGREDIENTS?\b/i.test(insomniaPdfRowText(row)),
    );

    if (!ingredientRow) {
      continue;
    }

    const name = normalizeInsomniaProductName(
      sortedRows
        .filter((row) => row.y > ingredientRow.y + 18 && row.y < 750)
        .filter((row) => row.items.some((item) => item.x < 450))
        .map(insomniaPdfRowText)
        .filter((line) => isInsomniaTitleLine(line))
        .join(" "),
    );

    if (!name || !isProbablyMenuItemName(name)) {
      continue;
    }

    const allergens = parseInsomniaDirectAllergens(pageText);
    const mayContain = parseInsomniaMayContainAllergens(pageText, allergens);

    if (allergens.length === 0 && mayContain.length === 0) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: insomniaCategoryForProduct(
          name,
          pageNumber,
          restaurant.category,
        ),
        description: null,
        evidenceText: insomniaEvidenceText(name, allergens, mayContain),
        imageUrl: null,
        ingredientsText: null,
        mayContain,
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: insomniaCategoryForProduct(
          name,
          pageNumber,
          restaurant.category,
        ),
      }),
    );
  }

  return mergeInsomniaOfficialRecords(records);
}

function insomniaPdfRowText(row) {
  return cleanText(
    row.items
      .sort((left, right) => left.x - right.x)
      .map((item) => item.str)
      .join(" ")
      .replace(/\s+-\s+/g, "-"),
  );
}

function isInsomniaTitleLine(line) {
  const text = cleanText(line);

  if (!text) {
    return false;
  }

  return !/\b(?:INGREDIENTS?|NUTRITION|FACTS|SERVING|CALORIES|TOTAL|FAT|SODIUM|CARBOHYDRATE|PROTEIN|CONTAINS|PRODUCT|SHARED|EQUIPMENT|PROCESSES|INSOMNIACOOKIES\.COM)\b/i.test(
    text,
  );
}

function normalizeInsomniaProductName(value) {
  const cleaned = cleanText(value)
    .replace(/\bGLUTEN\s*-\s*FREE\b/gi, "Gluten-Free")
    .replace(/\bD\s*['’]\s*OUGH\b/gi, "D'Ough")
    .replace(/\bN\s*['’]\s*/gi, "N'")
    .replace(/\bM\s*&\s*M\s*['’]?\s*S?\b/gi, "M&M's")
    .replace(/\bS\s*['’]\s*MORES\b/gi, "S'mores")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return null;
  }

  return titleCase(cleaned)
    .replace(/\bM&m's\b/g, "M&M's")
    .replace(/\bD'ough\b/g, "D'Ough")
    .replace(/\bN' Dream\b/g, "N' Dream")
    .replace(/\bS'mores\b/g, "S'mores")
    .replace(/\bGluten-Free\b/g, "Gluten-Free")
    .replace(/\bInsomnia Tracks\b/g, "Insomnia Tracks");
}

function parseInsomniaDirectAllergens(pageText) {
  const directText = [];
  const directPattern = /(?:ALLERGENS:\s*)?CONTAINS:?\s*([^\n]+)/gi;
  let match;

  while ((match = directPattern.exec(pageText))) {
    const segment = cleanText(match[1])
      .replace(/\bAND\s*$/i, "")
      .replace(/\.$/, "");

    if (
      segment &&
      !/\b(?:GLUTEN-FREE|SHARED EQUIPMENT|PROCESSES)\b/i.test(segment)
    ) {
      directText.push(segment);
    }
  }

  if (/\bCONTAINS\s+GLUTEN\b/i.test(pageText)) {
    directText.push("gluten");
  }

  return normalizeProviderAllergens(directText);
}

function parseInsomniaMayContainAllergens(pageText, directAllergens) {
  const mayContainText = [];
  const sharedMatch = pageText.match(
    /PRODUCT\s+HAS\s+BEEN\s+MANUFACTURED\s+ON\s+SHARED\s+EQUIPMENT[\s\S]{0,180}?\bPROCESSES\s+([^\n]+(?:\n[^\n]+)?)/i,
  );

  if (sharedMatch) {
    mayContainText.push(sharedMatch[1]);
  }

  if (
    /may come into contact with common food allergens/i.test(pageText) ||
    /ALL OF our products are[\s\S]{0,100}baked or prepared/i.test(pageText)
  ) {
    mayContainText.push("eggs, milk, wheat, soy, peanuts, tree nuts");
  }

  if (
    /gluten\s*-?\s*free products are prepared in an\s+environment where there is a risk of gluten exposure/i.test(
      pageText,
    )
  ) {
    mayContainText.push("gluten");
  }

  return normalizeProviderAllergens(mayContainText).filter(
    (allergen) => !directAllergens.includes(allergen),
  );
}

function insomniaCategoryForProduct(name, pageNumber, fallbackCategory) {
  if (/\b(?:waffle|cone)\b/i.test(name)) {
    return "Cones";
  }

  if (
    pageNumber >= 31 ||
    /\b(?:vanilla|caramellionaire|d['’]?ough|dreamweaver|minterstellar|tracks)\b/i.test(
      name,
    )
  ) {
    return "Ice Cream";
  }

  if (/\b(?:brownie|brookie|blondie)\b/i.test(name)) {
    return "Brownies";
  }

  if (pageNumber >= 5 && pageNumber <= 23) {
    return "Cookies";
  }

  return fallbackCategory ?? "Dessert";
}

function insomniaEvidenceText(name, allergens, mayContain) {
  const pieces = [];

  if (allergens.length > 0) {
    pieces.push(`${name} contains ${allergens.join(", ")}.`);
  }

  if (mayContain.length > 0) {
    pieces.push(
      `${name} is prepared where ${mayContain.join(", ")} may be present.`,
    );
  }

  return pieces.join(" ");
}

function mergeInsomniaOfficialRecords(records) {
  const byName = new Map();

  for (const record of records) {
    const key = similarityKey(record.name);

    if (!key) {
      continue;
    }

    const current = byName.get(key);

    if (!current) {
      byName.set(key, record);
      continue;
    }

    byName.set(key, {
      ...current,
      allergens: uniqueStrings([...current.allergens, ...record.allergens]),
      mayContain: uniqueStrings([...current.mayContain, ...record.mayContain]),
      evidence: uniqueEvidence([
        ...(current.evidence ?? []),
        ...(record.evidence ?? []),
      ]),
    });
  }

  return Array.from(byName.values());
}

export async function extractBbqChickenAllergenPdfItems(
  buffer,
  restaurant,
  url,
) {
  const rows = await readPdfPositionRows(buffer);
  const records = [];
  let currentCategory = restaurant.category;
  let inDetailedList = false;
  let pageRows = [];
  let currentPageNumber = null;

  function flushPageRows() {
    if (pageRows.length === 0) {
      return;
    }

    records.push(
      ...extractBbqChickenPageRows(pageRows, restaurant, url, currentCategory),
    );
    pageRows = [];
  }

  for (const row of rows) {
    if (currentPageNumber !== null && row.pageNumber !== currentPageNumber) {
      flushPageRows();
      inDetailedList = false;
    }
    currentPageNumber = row.pageNumber;

    const rowText = cleanText(row.items.map((item) => item.str).join(" "));

    if (!rowText) {
      continue;
    }

    const category = row.items.find(
      (item) => item.x < 80 && /^[A-Z][A-Z\s-]{3,}$/.test(item.str),
    )?.str;

    if (
      category &&
      !/^(?:MENU ITEM|COMMON ALLERGENS|ALLERGENS)$/i.test(category)
    ) {
      flushPageRows();
      currentCategory = titleCase(category);
    }

    if (
      /\bMENU ITEM\b/i.test(rowText) &&
      /\bPOTENTIAL CROSS-CONTAMINANTS\b/i.test(rowText)
    ) {
      flushPageRows();
      inDetailedList = true;
      continue;
    }

    if (!inDetailedList) {
      continue;
    }

    if (/^®$|^-- \d+ of \d+ --$/i.test(rowText)) {
      continue;
    }

    pageRows.push({
      ...row,
      category: currentCategory,
    });
  }

  flushPageRows();

  return uniqueBy(
    records.filter(
      (record) => record.name && isProbablyMenuItemName(record.name),
    ),
    (record) =>
      `${normalizeMenuName(record.category)}:${normalizeMenuName(record.name)}`,
  );
}

export function extractBbqChickenPageRows(
  rows,
  restaurant,
  url,
  fallbackCategory,
) {
  const records = [];
  const itemRows = rows
    .map((row) => {
      const name = cleanMenuName(
        row.items
          .filter((item) => item.x < 180)
          .map((item) => item.str)
          .join(" "),
      );

      return name && isProbablyMenuItemName(name) && !/^MENU ITEM$/i.test(name)
        ? { category: row.category ?? fallbackCategory, name, row }
        : null;
    })
    .filter(Boolean)
    .sort((left, right) => right.row.y - left.row.y);

  for (let index = 0; index < itemRows.length; index += 1) {
    const itemRow = itemRows[index];
    const previous = itemRows[index - 1];
    const next = itemRows[index + 1];
    const upperBound = previous
      ? (previous.row.y + itemRow.row.y) / 2
      : itemRow.row.y + 24;
    const lowerBound = next
      ? (itemRow.row.y + next.row.y) / 2
      : itemRow.row.y - 24;
    const bandRows = rows.filter(
      (row) => row.y < upperBound && row.y > lowerBound,
    );
    const allergenText = cleanText(
      bandRows
        .flatMap((row) => row.items)
        .filter((item) => item.x >= 180 && item.x < 520)
        .map((item) => item.str)
        .join(" "),
    );
    const crossContactText = cleanText(
      bandRows
        .flatMap((row) => row.items)
        .filter((item) => item.x >= 520)
        .map((item) => item.str)
        .join(" "),
    );
    const allergens = findAllergensInText(allergenText ?? "");
    const mayContain = uniqueStrings(
      findAllergensInText(crossContactText ?? "").filter(
        (allergen) => !allergens.includes(allergen),
      ),
    );

    if (allergens.length === 0 && mayContain.length === 0) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: itemRow.category,
        description: "Official bb.q Chicken allergy list.",
        evidenceText: cleanText(
          `${itemRow.name} allergens: ${allergenText ?? ""}; potential cross-contaminants: ${crossContactText ?? ""}`,
        ),
        imageUrl: null,
        ingredientsText: null,
        mayContain,
        name: itemRow.name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: itemRow.category,
      }),
    );
  }

  return records;
}

async function extractChasinTailsAllergenPdfItems(
  buffer,
  restaurant,
  url,
  text,
) {
  const friedCrossContactRecords =
    await extractCanvaFriedCrossContactAllergenTablePdfItems(
      buffer,
      restaurant,
      url,
      text,
    );
  const tableMatrixRecords = await extractGenericPdfTableAllergenMatrixRows(
    buffer,
    restaurant,
    url,
  );
  const positionMatrixRecords = await extractGenericPdfMenuMatrixRows(
    buffer,
    restaurant,
    url,
  );

  return mergeRecords([
    ...tableMatrixRecords,
    ...positionMatrixRecords,
    ...friedCrossContactRecords,
  ]);
}

export function extractFriedCrossContactAllergenTableItems(
  tables,
  restaurant,
  url,
  text = "",
) {
  if (
    !/ANYTHING FRIED WILL BE CONTAMINATED[\s\S]*GLUTEN AND SHELLFISH/i.test(
      text,
    )
  ) {
    return [];
  }

  const records = [];

  for (const table of tables ?? []) {
    const category = cleanText(table?.[0]?.[0]);
    const header = (table?.[1] ?? []).map(
      (cell) => cleanText(cell)?.toUpperCase() ?? "",
    );

    if (
      !category ||
      !header.includes("GLUTEN") ||
      !header.includes("SHELLFISH")
    ) {
      continue;
    }

    for (const row of table.slice(2)) {
      const rawName = cleanText(row?.[0]);
      const name = cleanMenuName(rawName?.replace(/\n+/g, " "));

      if (
        !name ||
        !isProbablyMenuItemName(name) ||
        !isOfficialFriedCrossContactRow(name, category)
      ) {
        continue;
      }

      const normalizedCategory = titleCase(category);

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens: [],
          category: normalizedCategory,
          description:
            "Official allergen sheet notes fried items may be cross-contaminated with gluten and shellfish.",
          evidenceText:
            "Anything fried will be contaminated with gluten and shellfish. There is not a dedicated fryer for vegan items.",
          imageUrl: null,
          ingredientsText: null,
          mayContain: ["gluten", "shellfish"],
          name,
          sourceKind: "pdf-matrix",
          sourceUrl: url,
          variantGroup: normalizedCategory,
        }),
      );
    }
  }

  return records;
}

function isOfficialFriedCrossContactRow(name, category) {
  const text = `${category ?? ""} ${name ?? ""}`;

  return /\b(?:crispy|fried|fries|hush\s+puppies|calamari|gator\s+bites)\b/i.test(
    text,
  );
}

function parseFoundingFarmersPricedLine(line) {
  const match = line.match(
    /^(.{2,90}?)\s+(?:\d+\s*oz\s*•\s*)?(?:\d{1,3}(?:\.\d{2})?)(?:\s*\|\s*\d{1,3}(?:\.\d{2})?)*(?:\s|$)/,
  );

  if (!match) {
    return null;
  }

  const name = cleanFoundingFarmersMenuName(match[1]);

  if (!name || isFoundingFarmersNonItemName(name) || /^[&]/.test(name)) {
    return null;
  }

  return {
    descriptionLines: [],
    name,
  };
}

function cleanFoundingFarmersMenuName(value) {
  return cleanText(
    value
      ?.replace(/\*/g, "")
      .replace(/\b(?:ONE|SIX|TWELVE)\b/gi, "")
      .replace(/\s*\|\s*$/g, "")
      .replace(/\s+/g, " "),
  );
}

function foundingFarmersCategoryFromUrl(url, fallback) {
  if (/Breakfast|Brunch/i.test(url)) {
    return "Breakfast/Brunch";
  }

  if (/First[-_ ]?Bake/i.test(url)) {
    return "Bakery";
  }

  if (/Dessert/i.test(url)) {
    return "Dessert";
  }

  if (/LunchDinner/i.test(url)) {
    return "Lunch & Dinner";
  }

  return fallback;
}

function isFoundingFarmersDescriptionLine(line) {
  return (
    line.length >= 3 &&
    line.length <= 180 &&
    !parseFoundingFarmersPricedLine(line) &&
    !isFoundingFarmersHeading(line) &&
    !isFoundingFarmersNonMenuLine(line)
  );
}

function isFoundingFarmersNameContinuation(line) {
  return (
    line.length >= 3 &&
    line.length <= 48 &&
    /^[A-Z0-9&’'“”().,\- ]+$/.test(line) &&
    !isFoundingFarmersHeading(line) &&
    !isFoundingFarmersNonMenuLine(line) &&
    !isFoundingFarmersNonItemName(line)
  );
}

function shouldPrefixFoundingFarmersItem(name) {
  return /^&\b|^(?:Banana Toast|Waffles|Hot Chocolate|Chocolate|Medium Roast)$/i.test(
    name,
  );
}

function isFoundingFarmersHeading(line) {
  const compact = line.replace(/[\s&,\-ÉÈ’']/g, "");

  return compact.length >= 3 && /^[A-Z]+$/.test(compact) && line.length <= 80;
}

function isFoundingFarmersNonMenuLine(line) {
  return (
    /^-- \d+ of \d+ --$/i.test(line) ||
    /^FF(?:DC|RS|T)\b/i.test(line) ||
    /^(?:Reston|Tysons)\s+(?:Breakfast|Brunch|Lunch|Dinner|Dessert|First\s*Bake)/i.test(
      line,
    ) ||
    /^A 22% gratuity/i.test(line) ||
    /^DEAR GUESTS WITH ALLERGIES/i.test(line) ||
    /^our scratch kitchen/i.test(line) ||
    /^is paramount/i.test(line) ||
    /^\*This item/i.test(line) ||
    /^DC OPERATIONAL SURCHARGE/i.test(line) ||
    /^Due to DC/i.test(line) ||
    /^We appreciate/i.test(line) ||
    /^PROUD TO BE/i.test(line) ||
    /^Thank you/i.test(line) ||
    /^KNOW YOUR/i.test(line)
  );
}

function isFoundingFarmersNonItemName(name) {
  return (
    /^(?:\d+(?:\.\d+)?\s*(?:oz|pieces?|piece)?|1 for|add|choose|choice of|served with|serves|single or double|sub|dairy selection|sustainably|humanely|house-ground|all bread|we serve|from our|traceable|simple style|lemon butter|mojito spring onion|apricot mustard|vera cruz)$/i.test(
      name,
    ) || /^(?:founding farmers|lunch & dinner in dc)$/i.test(name)
  );
}

function isRestaurantStructuredMetadataRecord(
  name,
  description,
  restaurant,
  url,
  sourceKind,
) {
  if (sourceKind !== "json-structured") {
    return false;
  }

  if (/^nutritionix$/i.test(cleanText(name) ?? "")) {
    return true;
  }

  const normalizedName = normalizeStructuredRecordText(name);
  const normalizedRestaurantName = normalizeStructuredRecordText(
    restaurant.name,
  );

  if (
    normalizedName === normalizedRestaurantName ||
    normalizedName === `${normalizedRestaurantName} restaurants` ||
    normalizedName === `${normalizedRestaurantName} buffet restaurants` ||
    /(?:^|\b)(?:allergen statement|nutrition and dietary options)$/i.test(
      cleanText(name) ?? "",
    ) ||
    /\b(?:allergen statement|nutrition database|dietary options)\b/i.test(
      description ?? "",
    )
  ) {
    return true;
  }

  if (getBrandAdapter(restaurant.id).brandKey === "founding-farmers") {
    return (
      normalizedName === "founding farmers" ||
      /^lunch dinner in\b/i.test(normalizedName) ||
      /book your table/i.test(description ?? "") ||
      /farmer owned restaurant/i.test(description ?? "")
    );
  }

  return (
    normalizeStructuredRecordText(name) ===
    normalizeStructuredRecordText(restaurant.name)
  );
}

function normalizeStructuredRecordText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function extractShakeShackNutritionAllergenPdfItems(text, restaurant, url) {
  const records = [];
  const normalizedText = text
    .replace(/\r/g, "")
    .replace(/[™®]/g, "")
    .replace(/[ \t]+/g, " ");
  const lines = normalizedText
    .split(/\n+/)
    .map((line) => cleanText(line))
    .filter(Boolean);
  let currentCategory = restaurant.category;

  for (const line of lines) {
    const category = shakeShackCategoryHeading(line);

    if (category) {
      currentCategory = category;
      continue;
    }

    const containsMatch = line.match(
      /^(.{2,120}?)\s+Contains:\s+([A-Za-z, ]+?)(?=\s+\d+(?:\.\d+)?(?:\s|$)|$)/i,
    );

    const nutritionOnlyMatch = containsMatch
      ? null
      : line.match(/^(.{2,120}?)\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+/);
    const nutritionMatch = line.match(
      /^(.{2,120}?)\s+(?:Contains:\s+[A-Za-z, ]+?\s+)?(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)(?:\s|$)/i,
    );
    const name = cleanShakeShackPdfName(
      containsMatch?.[1] ?? nutritionOnlyMatch?.[1],
    );
    const allergenText = cleanText(containsMatch?.[2]);
    const allergens = allergenText ? findAllergensInText(allergenText) : [];

    if (
      !name ||
      !isProbablyMenuItemName(name) ||
      isShakeShackPdfNoiseName(name)
    ) {
      continue;
    }
    const categoryForItem = shakeShackCategoryForItem(name, currentCategory);

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: categoryForItem,
        description: "Official Shake Shack nutrition and allergen information.",
        imageUrl: null,
        mayContain: [],
        name,
        nutritionFacts: nutritionFactsFromOrderedValues(
          nutritionMatch?.slice(2),
        ),
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: categoryForItem,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function cleanShakeShackPdfName(value) {
  return cleanText(value)
    ?.replace(/\s+/g, " ")
    .replace(/\s+\*+$/g, "")
    .trim();
}

function isShakeShackPdfNoiseName(value) {
  return /^(?:Calories|Total Fat|Sat Fat|Trans Fat|Cholesterol|Sodium|Total|Carbohydrates|Fiber|Sugars|Protein|Calories per serving|-- \d+ of \d+ --)$/i.test(
    value,
  );
}

function shakeShackCategoryForItem(name, fallbackCategory) {
  if (
    /^Add .*(?:Dressing|Croutons|Parmesan|Grilled Chicken|Balsamic|Ceaser|Caesar|Sweety Drop)/i.test(
      name,
    )
  ) {
    return "Salads";
  }

  if (
    /^Add .*(?:Sauce|Pickles|Slaw|Honey|Seasoning|Peppers|Jalapenos|Onions|Breadcrumbs|Tartar)/i.test(
      name,
    )
  ) {
    return "Extras";
  }

  if (/Lettuce Wrap|Gluten Free Bun/i.test(name)) {
    return "Lettuce Wraps & Gluten Free Buns";
  }

  if (
    /(?:Beer|Ale|IPA|Lager|Pilsner|Cocktail|Vodka|Rum|Gin|Tequila|Whiskey|Bourbon|Martini|Spritz|Mixer|Mai Tai|Shackarita|Red Bull|Club Soda|Tonic|Ginger Beer|Wine|Seltzer|Cider|Draft|Can \\(|Bottle\\))/i.test(
      name,
    )
  ) {
    return "Beer, Wines, Cocktails & Non-Alcoholic Drinks";
  }

  return fallbackCategory;
}

function shakeShackCategoryHeading(line) {
  const headings = new Set([
    "Burgers",
    "Chicken",
    "Crinkle Cut Fries",
    "Fries & Sides",
    "Extras",
    "Flat-Top Dogs",
    "Breakfast",
    "Shakes",
    "Cups & Sundaes",
    "Salads",
    "Lettuce Wraps & Gluten Free Buns",
    "Frozen Custard",
    "Drinks",
    "Lemonades",
    "Beer, Wines, Cocktails & Non-Alcoholic Drinks",
    "Regional Beers",
    "Beer, Wines & Cocktails",
    "Retail",
    "Woof",
  ]);
  const normalized = cleanText(line)
    ?.replace(/[™®]/g, "")
    .replace(/\s*-\s*/g, "-");

  return headings.has(normalized) ? normalized : null;
}

async function extractDutchBrosNutritionPdfItems(buffer, restaurant, url) {
  const records = [];
  const pdfjsLib = await getPdfJsLib();
  const document = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
    .promise;
  const lines = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    lines.push(
      ...textContent.items.map((item) => cleanText(item.str)).filter(Boolean),
    );
  }

  let currentCategory = restaurant.category;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const category = dutchBrosCategoryHeading(line, lines[index + 1]);

    if (category) {
      currentCategory = category;
      continue;
    }

    const type = cleanText(lines[index + 1]);
    const size = cleanText(lines[index + 2]);
    const values = lines.slice(index + 3, index + 15);
    const allergyText = cleanText(lines[index + 15]);

    if (
      !line ||
      !isProbablyMenuItemName(line) ||
      !isDutchBrosType(type) ||
      !isDutchBrosSize(size) ||
      values.length < 12 ||
      !values.every((value) => parseNutritionNumber(value) !== null) ||
      !/contains|allerg/i.test(allergyText ?? "")
    ) {
      continue;
    }

    const name = cleanText(`${line} ${type} ${size}`);

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens: findDeclaredAllergensOnly(allergyText),
        category: currentCategory,
        description: "Official Dutch Bros nutritional guide PDF.",
        imageUrl: null,
        mayContain: findMayContainAllergens(allergyText),
        name,
        nutritionFacts: nutritionFactsFromDutchBrosValues(values),
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: line,
      }),
    );
    index += 15;
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function nutritionFactsFromDutchBrosValues(values) {
  const labels = [
    "Calories",
    "Calories from Fat",
    "Total Fat",
    "Saturated Fat",
    "Trans Fat",
    "Cholesterol",
    "Sodium",
    "Total Carbohydrates",
    "Dietary Fiber",
    "Sugars",
    "Protein",
    "Caffeine",
  ];
  return normalizeNutritionFacts(
    Object.fromEntries(
      labels.map((label, index) => [
        label,
        parseNutritionNumber(values[index]) ?? values[index],
      ]),
    ),
  );
}

function isDutchBrosType(value) {
  return /^(?:Hot|Iced|Blended|Toasted|Nitro|Dutch|Sparkling|Still|Energy|Lemonade|Tea)$/i.test(
    value ?? "",
  );
}

function isDutchBrosSize(value) {
  return /^(?:Kids|Small|Medium|Large|Nitro|One Size|Single|Double|Regular)$/i.test(
    value ?? "",
  );
}

function dutchBrosCategoryHeading(line, nextLine) {
  const normalized = cleanText(line)
    ?.replace(/[™®]/g, "")
    .trim();

  if (
    normalized &&
    /^[A-Z0-9 '&-]{4,}$/.test(normalized) &&
    !/^(?:Type|Size|Total|Calories|Saturated|Trans|Cholesterol|Sodium|Dietary|Protein|Caffeine|Allergies|Last Updated|Dutch Bros Coffee Nutritional Guide)$/i.test(
      normalized,
    ) &&
    nextLine &&
    /^[A-Z0-9 ,.!'&-]{8,}$/.test(nextLine)
  ) {
    return titleCase(normalized);
  }

  return null;
}

function extractCkeNutritionCodePdfItems(text, restaurant, url) {
  const codeMap = new Map([
    ["E", "egg"],
    ["F", "fish"],
    ["M", "milk"],
    ["P", "peanut"],
    ["SF", "shellfish"],
    ["S", "soy"],
    ["T", "tree-nut"],
    ["W", "wheat"],
    ["SS", "sesame"],
  ]);
  const records = [];
  let currentCategory = restaurant.category;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+\t/g, "\t").replace(/\t\s+/g, "\t").trim();
    const cleanLine = cleanText(line);

    if (!cleanLine) {
      continue;
    }

    if (isCategoryLine(cleanLine)) {
      currentCategory = titleCase(cleanLine);
      continue;
    }

    const parts = line.split(/\t+/).map(cleanText).filter(Boolean);
    const allergenIndex = parts.findIndex((part) =>
      /^(?:E|F|M|P|SF|S|T|W|SS)(?:\s*,\s*(?:E|F|M|P|SF|S|T|W|SS))*\+?$/i.test(
        part.replace(/\s+/g, ""),
      ),
    );

    if (allergenIndex <= 0) {
      continue;
    }

    const name = cleanCkeNutritionName(parts.slice(0, allergenIndex).join(" "));

    if (!name || !isProbablyMenuItemName(name)) {
      continue;
    }

    const codes = parts[allergenIndex]
      .replace(/\s+/g, "")
      .replace(/\+$/, "")
      .split(",");
    const allergens = codes
      .map((code) => codeMap.get(code.toUpperCase()))
      .filter(Boolean);
    const mayContain =
      /\+/.test(parts[allergenIndex]) || /shakes? and malts/i.test(name)
        ? ["peanut", "tree-nut"]
        : [];
    const nutritionFacts = nutritionFactsFromCkeValues(
      parts.slice(allergenIndex + 1),
    );

    if (!nutritionFacts || Object.keys(nutritionFacts).length === 0) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: `Official ${restaurant.name} nutrition PDF allergen code row.`,
        imageUrl: null,
        mayContain,
        name,
        nutritionFacts,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function nutritionFactsFromCkeValues(values) {
  const labels = [
    "Serving Size",
    "Calories",
    "Calories from Fat",
    "Total Fat",
    "Saturated Fat",
    "Trans Fat",
    "Cholesterol",
    "Sodium",
    "Total Carbohydrates",
    "Dietary Fiber",
    "Sugars",
    "Protein",
  ];
  const numericValues = values
    .filter((value) => parseNutritionNumber(value) !== null)
    .slice(0, 12);

  if (numericValues.length < 10) {
    return null;
  }

  return normalizeNutritionFacts(
    Object.fromEntries(
      labels.map((label, index) => [
        label,
        index === 0 && numericValues[index]
          ? `${numericValues[index]} g`
          : numericValues[index],
      ]),
    ),
  );
}

function cleanCkeNutritionName(value) {
  return cleanText(value)
    ?.replace(/\s{2,}/g, " ")
    .replace(/\s+\((?:\d+|oz\.?|pc|pieces?)\)\s*$/i, "")
    .trim();
}

async function extractElPolloLocoNutritionPdfItems(buffer, restaurant, url) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 4);
  const columns = [
    { allergen: "egg", x: 455 },
    { allergen: "fish", x: 479 },
    { allergen: "milk", x: 505 },
    { allergen: "peanut", x: 533 },
    { allergen: "sesame", x: 560 },
    { allergen: "shellfish", x: 589 },
    { allergen: "soy", x: 618 },
    { allergen: "tree-nut", x: 647 },
    { allergen: "wheat", x: 676 },
  ];
  const records = [];
  let currentCategory = restaurant.category;

  for (const row of rows) {
    const rowText =
      cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const leftText = cleanText(
      row.items
        .filter((item) => item.x < 430)
        .map((item) => item.str)
        .join(" "),
    );
    const name = cleanElPolloLocoPdfName(leftText);

    if (!name || isElPolloLocoPdfNoise(rowText, name)) {
      continue;
    }

    const markers = row.items.filter(
      (item) => /^X$/i.test(item.str) && item.x >= 430,
    );

    if (markers.length === 0 && isCategoryLine(name)) {
      currentCategory = titleCase(name);
      continue;
    }

    if (!isProbablyMenuItemName(name)) {
      continue;
    }

    const allergens = markers
      .map((marker) => closestAllergenColumn(marker.x, columns, 16))
      .filter(Boolean);
    const nutritionFacts = nutritionFactsFromElPolloLocoRow(row.items);

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: "Official El Pollo Loco nutrition guide allergen matrix.",
        imageUrl: null,
        mayContain: [],
        name,
        nutritionFacts,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function nutritionFactsFromElPolloLocoRow(items) {
  const numericValues = items
    .map((item) => item.str)
    .filter(isNutritionValueToken)
    .slice(0, 12);

  if (numericValues.length < 12) {
    return null;
  }

  return normalizeNutritionFacts({
    "Serving Size": numericValues[0],
    Calories: numericValues[1],
    "Calories from Fat": numericValues[2],
    "Total Fat": numericValues[3],
    "Saturated Fat": numericValues[4],
    "Trans Fat": numericValues[5],
    Cholesterol: numericValues[6],
    Sodium: numericValues[7],
    "Total Carbohydrates": numericValues[8],
    "Dietary Fiber": numericValues[9],
    Sugars: numericValues[10],
    Protein: numericValues[11],
  });
}

function cleanElPolloLocoPdfName(value) {
  return cleanText(value)
    ?.replace(/\s+\*+$/, "")
    .replace(/\bTM\b/g, "")
    .replace(/(?:\s+-?(?:\d+(?:\.\d+)?|\.\d+)){4,}$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isElPolloLocoPdfNoise(rowText, name) {
  return (
    /^(?:Serving Size|Total Calories|Calories from Fat|Total Fat|Saturated Fat|Trans Fat|Cholesterol|Sodium|Total Carbohydrates|Dietary Fiber|Sugars|Protein|Egg|Fish|Milk|Peanut|Sesame|Shellfish|Soy|Tree Nuts|Wheat|NUTRITION GUIDE|All nutritional information|The allergen information|M\d+ \d{4})/i.test(
      rowText,
    ) ||
    /^(?:FEATURED|PROTEIN-PACKED|FIRE-GRILLED CHICKEN|SIDES \(Small\) & SAUCES|TOSTADAS & SALADS|BURRITOS|QUESADILLAS|DESSERTS|DRINKS)$/i.test(
      name,
    )
  );
}

function closestAllergenColumn(x, columns, tolerance) {
  const closest = columns
    .map((column) => ({ ...column, distance: Math.abs(column.x - x) }))
    .sort((left, right) => left.distance - right.distance)[0];

  return closest?.distance <= tolerance ? closest.allergen : null;
}

async function extractBjsAllergenPdfItems(buffer, restaurant, url) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 6);
  const columns = [
    { allergen: "egg", x: 256 },
    { allergen: "fish", x: 285 },
    { allergen: "milk", x: 315 },
    { allergen: "peanut", x: 369 },
    { allergen: "gluten", x: 394 },
    { allergen: "shellfish", x: 427 },
    { allergen: "soy", x: 461 },
    { allergen: "sulfites", x: 486 },
    { allergen: "tree-nut", x: 514 },
    { allergen: "wheat", x: 546 },
    { allergen: "sesame", x: 578 },
  ];
  const records = [];
  let currentCategory = restaurant.category;
  let lastBaseName = null;

  for (const row of rows) {
    const rowText =
      cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const leftText = cleanText(
      row.items
        .filter((item) => item.x < 245)
        .map((item) => item.str)
        .join(" "),
    );

    if (!leftText || isBjsPdfNoise(rowText, leftText)) {
      continue;
    }

    const markers = row.items.filter(
      (item) => /^•$/.test(item.str) && item.x >= 245,
    );

    if (markers.length === 0) {
      if (
        isCategoryLine(leftText) ||
        /^[A-Z][A-Z\s&'/-]+(?: cont\.)?$/i.test(leftText)
      ) {
        currentCategory = titleCase(leftText.replace(/\s+cont\.$/i, ""));
      } else if (!/^Choice\b/i.test(leftText)) {
        lastBaseName = leftText;
      }
      continue;
    }

    const name = cleanBjsPdfName(
      /^Choice\b/i.test(leftText) && lastBaseName
        ? `${lastBaseName} ${leftText}`
        : leftText,
    );

    if (!name || !isProbablyMenuItemName(name)) {
      continue;
    }

    if (!/^Choice\b/i.test(leftText)) {
      lastBaseName = leftText;
    }

    const allergens = markers
      .map((marker) => closestAllergenColumn(marker.x, columns, 16))
      .filter(Boolean);

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description:
          "Official BJ's Restaurant & Brewhouse allergen sensitivities PDF.",
        imageUrl: null,
        mayContain: [],
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function cleanBjsPdfName(value) {
  return cleanText(value)
    ?.replace(/\s+/g, " ")
    .replace(/\s+\(TEST\)$/i, "")
    .trim();
}

function isBjsPdfNoise(rowText, name) {
  return (
    /^(?:FOOD ALLERGEN|AND GLUTEN|MAY 20\d{2}|-- \d+ of \d+ --|GA_\d+|Sesame Seeds|Eggs|Peanuts|Shellfish|Sulfites|Wheat|Tree Nuts|Milk|Fish|Soy|Other Gluten|MSG|MSG Notice)/i.test(
      rowText,
    ) || /^This version is not currently offered/i.test(name)
  );
}

async function extractBjsNutritionPdfItems(buffer, restaurant, url) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 4);
  const records = [];
  let currentCategory = restaurant.category;
  let lastBaseName = null;

  for (const row of rows) {
    const rowText =
      cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const leftText = cleanBjsPdfName(
      row.items
        .filter((item) => item.x < 220)
        .map((item) => item.str)
        .join(" "),
    );
    const nutritionFacts = nutritionFactsFromBjsRow(row.items);

    if (!leftText || isBjsNutritionNoise(rowText)) {
      continue;
    }

    if (
      Object.keys(nutritionFacts ?? {}).length === 0 ||
      parseNutritionNumber(nutritionFacts.Calories) === null
    ) {
      if (
        isCategoryLine(leftText) ||
        /^[A-Z][A-Z\s&'/-]+(?: cont\.)?$/i.test(leftText)
      ) {
        currentCategory = titleCase(leftText.replace(/\s+cont\.$/i, ""));
      } else if (!/^Choice\b/i.test(leftText)) {
        lastBaseName = leftText;
      }
      continue;
    }

    const name = cleanBjsPdfName(
      /^Choice\b/i.test(leftText) && lastBaseName
        ? `${lastBaseName} ${leftText}`
        : leftText,
    );

    if (!name || !isProbablyMenuItemName(name)) {
      continue;
    }

    if (!/^Choice\b/i.test(leftText)) {
      lastBaseName = leftText;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.unavailable,
        allergens: [],
        category: currentCategory,
        description:
          "Official BJ's Restaurant & Brewhouse nutrition guide PDF.",
        imageUrl: null,
        mayContain: [],
        name,
        nutritionFacts,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function nutritionFactsFromBjsRow(items) {
  const valueAt = (targetX, tolerance = 15) =>
    cleanText(
      items.find((item) => Math.abs(item.x - targetX) <= tolerance)?.str,
    );

  return normalizeNutritionFacts({
    Calories: valueAt(228),
    "Calories from Fat": valueAt(263),
    "Total Fat": valueAt(299),
    "Saturated Fat": valueAt(334),
    "Trans Fat": valueAt(370),
    Cholesterol: valueAt(400),
    Sodium: valueAt(432),
    "Total Carbohydrates": valueAt(469),
    "Dietary Fiber": valueAt(505),
    Sugars: valueAt(539),
    Protein: valueAt(572),
  });
}

function isBjsNutritionNoise(rowText) {
  return /^(?:NUTRITIONAL GUIDE|MAY 20\d{2}|Total Calories|Fat Calories|Total Fat|Saturated Fat|Trans Fat|Cholesterol|Sodium|Total Carbs|Fiber|Sugars|Protein|kcal|GA_\d+|-- \d+ of \d+ --)$/i.test(
    rowText,
  );
}

export function extractTropicalSmoothieNutritionPdfItems(
  text,
  restaurant,
  url,
) {
  const codeMap = new Map([
    ["1", "egg"],
    ["2", "fish"],
    ["3", "milk"],
    ["4", "peanut"],
    ["5", "shellfish"],
    ["6", "soy"],
    ["7", "tree-nut"],
    ["8", "wheat"],
    ["9", "sesame"],
  ]);
  const records = [];
  const explicitAllergensByName = new Map();
  let currentCategory = restaurant.category;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+\t/g, "\t").replace(/\t\s+/g, "\t").trim();
    const cleanLine = cleanText(line);

    if (!cleanLine) {
      continue;
    }

    if (isTropicalSmoothieNutritionCategoryLine(cleanLine)) {
      currentCategory = tropicalSmoothieCategoryLabel(cleanLine);
      continue;
    }

    const explicitAllergenRow = parseTropicalSmoothieExplicitAllergenRow(line);
    if (explicitAllergenRow) {
      explicitAllergensByName.set(
        similarityKey(explicitAllergenRow.name),
        explicitAllergenRow.allergens,
      );
      continue;
    }

    const parts = line.split(/\t+/).map(cleanText).filter(Boolean);

    if (parts.length < 5 || !/^(?:N\/A|\d+(?:\.\d+)?)$/i.test(parts[1] ?? "")) {
      continue;
    }

    const parsed = parseTropicalSmoothieNutritionRow(parts);

    if (!parsed || !isProbablyMenuItemName(parsed.name)) {
      continue;
    }

    const category = tropicalSmoothieCategoryForName(
      parsed.name,
      currentCategory,
    );
    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens: uniqueStrings(
          parsed.codes.map((code) => codeMap.get(code)).filter(Boolean),
        ),
        category,
        description:
          "Official Tropical Smoothie Cafe nutrition guide allergen footnotes.",
        imageUrl: null,
        mayContain: [],
        name: parsed.name,
        nutritionFacts: nutritionFactsFromTropicalSmoothieValues(parsed.values),
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: category,
      }),
    );
  }

  const mergedRecords = records.map((record) => {
    const explicitAllergens =
      explicitAllergensByName.get(similarityKey(record.name)) ??
      explicitAllergensByName.get(
        similarityKey(tropicalSmoothieBaseName(record.name)),
      );

    return explicitAllergens
      ? {
          ...record,
          allergens: explicitAllergens,
        }
      : record;
  });

  for (const [nameKey, allergens] of explicitAllergensByName) {
    const hasRecord = mergedRecords.some(
      (record) =>
        similarityKey(record.name) === nameKey ||
        similarityKey(tropicalSmoothieBaseName(record.name)) === nameKey,
    );

    if (hasRecord) {
      continue;
    }

    const name = nameKey
      .split("-")
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
      .join(" ");

    mergedRecords.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: tropicalSmoothieCategoryForName(name, restaurant.category),
        description:
          "Official Tropical Smoothie Cafe nutrition guide allergen table.",
        imageUrl: null,
        mayContain: [],
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: tropicalSmoothieCategoryForName(
          name,
          restaurant.category,
        ),
      }),
    );
  }

  return uniqueBy(
    mergedRecords,
    (record) => `${record.category}:${record.name}`,
  );
}

function isTropicalSmoothieNutritionCategoryLine(line) {
  return (
    isCategoryLine(line) ||
    /^(?:KIDS SMOOTHIES(?:\s*\(12 OZ\.\))?|SUPPLEMENTS|FRESH ADD-INS|BOTTLED BEVERAGES|FOOD|SIDES|‘?DILLAS|DILLAS)$/i.test(
      line,
    )
  );
}

function tropicalSmoothieCategoryLabel(line) {
  const normalized = cleanText(line)?.replace(/^['‘’]/, "") ?? "";

  if (/^KIDS SMOOTHIES/i.test(normalized)) {
    return "Smoothies";
  }

  if (/^DILLAS$/i.test(normalized)) {
    return "Dillas";
  }

  return titleCase(normalized) ?? "Menu";
}

function parseTropicalSmoothieNutritionRow(parts) {
  const nameAndCodes = parts[0];
  const match = nameAndCodes.match(
    /^(.+?)(?:\s+((?:[1-9]|10)(?:\s+(?:[1-9]|10))*))?$/,
  );
  const name = cleanText(match?.[1] ?? nameAndCodes);
  const codes = (match?.[2] ?? "").split(/\s+/).filter(Boolean);
  const values = parts.slice(1);

  if (values.length < 10) {
    return null;
  }

  return { codes, name, values };
}

function parseTropicalSmoothieExplicitAllergenRow(line) {
  const parts = line.split(/\t+/).map(cleanText).filter(Boolean);

  if (
    parts.length < 4 ||
    (!/^allergens?$/i.test(parts[1]) &&
      !/^(?:none|[a-z,\s-]+)$/i.test(parts[1]))
  ) {
    return null;
  }

  if (
    !/^(?:yes|no)$/i.test(parts.at(-1) ?? "") ||
    !/^(?:yes|no)$/i.test(parts.at(-2) ?? "")
  ) {
    return null;
  }

  const name = cleanText(parts[0]);
  const allergenText = cleanText(parts[1]);

  if (!name || /^menu item$/i.test(name) || !isProbablyMenuItemName(name)) {
    return null;
  }

  return {
    allergens: /^none$/i.test(allergenText ?? "")
      ? []
      : findAllergensInText(allergenText ?? ""),
    name,
  };
}

function nutritionFactsFromTropicalSmoothieValues(values) {
  if (values.length >= 15) {
    return normalizeNutritionFacts({
      Calories: values[0],
      "Calories with Splenda": values[1],
      "Calories from Fat": values[2],
      "Total Fat": values[3],
      "Saturated Fat": values[4],
      "Trans Fat": values[5],
      Cholesterol: values[6],
      Sodium: values[7],
      "Total Carbohydrates": values[8],
      "Carbohydrates with Splenda": values[9],
      "Dietary Fiber": values[10],
      Sugars: values[11],
      "Sugars with Splenda": values[12],
      Protein: values[13],
      Caffeine: values[14],
    });
  }

  return normalizeNutritionFacts({
    Calories: values[0],
    "Calories from Fat": values[1],
    "Total Fat": values[2],
    "Saturated Fat": values[3],
    "Trans Fat": values[4],
    Cholesterol: values[5],
    Sodium: values[6],
    "Total Carbohydrates": values[7],
    "Dietary Fiber": values[8],
    Sugars: values[9],
    Protein: values[10],
  });
}

function tropicalSmoothieCategoryForName(name, fallbackCategory) {
  const cleaned = cleanText(name) ?? "";

  if (/\bsmoothie\b/i.test(cleaned)) {
    return "Smoothies";
  }

  if (/\bflat\b|\bflatbread\b/i.test(cleaned)) {
    return "Flatbreads";
  }

  if (/\bdilla\b/i.test(cleaned)) {
    return "Dillas";
  }

  return fallbackCategory ?? "Menu";
}

function tropicalSmoothieBaseName(name) {
  return cleanText(name)
    ?.replace(/^(?:12|24)\s+oz\s+/i, "")
    .replace(
      /\s+(?:full turbinado|no turbinado|add half turbinado|add splenda)$/i,
      "",
    )
    .trim();
}

async function extractQdobaAllergenPdfItems(buffer, restaurant, url) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 5);
  const columns = [
    { allergen: "wheat", x: 172 },
    { allergen: "soy", x: 216 },
    { allergen: "milk", x: 259 },
    { allergen: "egg", x: 302 },
    { allergen: "tree-nut", x: 345 },
    { allergen: "peanut", x: 389 },
    { allergen: "fish", x: 432 },
    { allergen: "shellfish", x: 477 },
    { allergen: "gluten", x: 525 },
  ];
  const records = [];
  let currentCategory = restaurant.category;

  for (const row of rows) {
    const rowText =
      cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const name = cleanQdobaPdfName(
      row.items
        .filter((item) => item.x < 155)
        .map((item) => item.str)
        .join(" "),
    );

    if (!name || isQdobaPdfNoise(rowText, name)) {
      continue;
    }

    const markers = row.items.filter(
      (item) => /^[XΔ]$/i.test(item.str) && item.x >= 155,
    );

    if (markers.length === 0 && isCategoryLine(name)) {
      currentCategory = titleCase(name);
      continue;
    }

    if (!isProbablyMenuItemName(name)) {
      continue;
    }

    const allergens = [];
    const mayContain = [];

    for (const marker of markers) {
      const allergen = closestAllergenColumn(marker.x, columns, 17);

      if (!allergen) {
        continue;
      }

      if (/^Δ$/i.test(marker.str)) {
        mayContain.push(allergen);
      } else {
        allergens.push(allergen);
      }
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: "Official Qdoba allergen information PDF.",
        imageUrl: null,
        mayContain,
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function cleanQdobaPdfName(value) {
  return cleanText(value)
    ?.replace(/\s+\*+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isQdobaPdfNoise(rowText, name) {
  return (
    /^(?:X Contains|Δ May contain|Wheat|Soy|Milk|Egg|Tree Nuts|Peanuts|Fish|Crustacean|\/Shellfish|Gluten|Vegan|ATTENTION VALUED|Foods prepared|and SHELLFISH|ALLERGEN INFORMATION|-- \d+ of \d+ --|\* Products|V- Vegan|Signature Builds|Kid's Meals)/i.test(
      rowText,
    ) || /^(?:Fountain Beverages|Bottled Beverages)$/i.test(name)
  );
}

async function extractDelTacoAllergenPdfItems(buffer, restaurant, url) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 3);
  const columns = [
    { allergen: "milk", x: 318 },
    { allergen: "egg", x: 338 },
    { allergen: "fish", x: 358 },
    { allergen: "shellfish", x: 383 },
    { allergen: "tree-nut", x: 407 },
    { allergen: "peanut", x: 432 },
    { allergen: "wheat", x: 460 },
    { allergen: "soy", x: 485 },
    { allergen: "sesame", x: 510 },
    { allergen: "gluten", x: 535 },
  ];
  const records = [];
  let currentCategory = restaurant.category;
  let pendingName = null;

  for (const row of rows) {
    const rowText =
      cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const leftText = cleanDelTacoPdfName(
      row.items
        .filter((item) => item.x < 265)
        .map((item) => item.str)
        .join(" "),
    );

    if (!leftText || isDelTacoPdfNoise(rowText, leftText)) {
      continue;
    }

    const markers = row.items.filter(
      (item) => /^X$/i.test(item.str) && item.x >= 310,
    );

    const splitName = splitDelTacoLeadingCategory(leftText);

    if (markers.length === 0) {
      if (
        isCategoryLine(leftText) ||
        /^[A-Z0-9&'®\s-]{3,40}$/.test(leftText)
      ) {
        currentCategory = titleCase(leftText);
        pendingName = null;
      } else if (isProbablyMenuItemName(leftText)) {
        pendingName = pendingName ? `${pendingName} ${leftText}` : leftText;
      }
      continue;
    }

    if (splitName) {
      currentCategory = splitName.category;
    }

    const itemName = splitName?.name ?? leftText;
    const name = pendingName
      ? cleanDelTacoPdfName(`${pendingName} ${itemName}`)
      : itemName;
    pendingName = null;

    if (!name || !isProbablyMenuItemName(name)) {
      continue;
    }

    const allergens = markers
      .map((marker) => closestAllergenColumn(marker.x, columns, 14))
      .filter(Boolean);

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: "Official Del Taco allergen list PDF.",
        imageUrl: null,
        mayContain: [],
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function cleanDelTacoPdfName(value) {
  return cleanText(value)
    ?.replace(/\*+$/g, "")
    .replace(/^& NACHOS\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isDelTacoPdfNoise(rowText, name) {
  return (
    /^(?:DEL TACO MENU ITEMS|Vegetarian Vegan|SENSITIVITIES|CLAIMS|Menu Item Name|P5-2026|-- \d+ of \d+ --|©|Please be|DR PEPPER|INGREDIENTS|FOUNTAIN DRINKS)$/i.test(
      rowText,
    ) || /^P5-2026\b/i.test(name)
  );
}

function splitDelTacoLeadingCategory(name) {
  const categories = [
    "BURGERS & FRIES",
    "BURRITOS",
    "TACOS",
    "EPIC BURRITOS",
    "QUESADILLAS",
    "NACHOS",
    "DESSERTS",
    "BREAKFAST",
    "SAUCES",
    "SIDES",
    "SALADS",
    "KIDS",
    "QUESADILLAS & NACHOS",
  ];

  for (const category of categories) {
    if (name.startsWith(`${category} `)) {
      return {
        category: titleCase(category),
        name: name.slice(category.length).trim(),
      };
    }
  }

  if (name.startsWith("& NACHOS ")) {
    return {
      category: "Quesadillas & Nachos",
      name: name.slice("& NACHOS ".length).trim(),
    };
  }

  return null;
}

async function extractCavaAllergenPdfItems(buffer, restaurant, url) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 4);
  const columns = [
    { allergen: "wheat", x: 180 },
    { allergen: "milk", x: 220 },
    { allergen: "soy", x: 257 },
    { allergen: "egg", x: 293 },
    { allergen: "tree-nut", x: 331 },
    { allergen: "sesame", x: 364 },
    { allergen: "peanut", x: 401 },
    { allergen: "fish", x: 444 },
    { allergen: "shellfish", x: 474 },
  ];
  const records = [];
  let currentCategory = restaurant.category;

  for (const row of rows.filter((entry) => entry.pageNumber <= 3)) {
    const rowText =
      cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const parsed = parseCavaNutritionRow(row.items);

    if (!parsed) {
      const category = cavaNutritionCategory(rowText);

      if (category) {
        currentCategory = category;
      }

      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.unavailable,
        allergens: [],
        category: currentCategory,
        description: "Official CAVA nutrition and allergen guide PDF.",
        imageUrl: null,
        mayContain: [],
        name: parsed.name,
        nutritionFacts: nutritionFactsFromCavaValues(parsed.values),
        sourceKind: "pdf-nutrition",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  for (const row of rows.filter((entry) => entry.pageNumber >= 4)) {
    const rowText =
      cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const name = cleanText(
      row.items
        .filter((item) => item.x < 165)
        .map((item) => item.str)
        .join(" "),
    );

    if (!name || isCavaPdfNoise(rowText, name)) {
      continue;
    }

    const markers = row.items.filter(
      (item) =>
        /^(?:Contains|•|x|X)$/i.test(item.str) && item.x >= 165 && item.x < 500,
    );

    if (markers.length === 0 && isCategoryLine(name)) {
      currentCategory = titleCase(name);
      continue;
    }

    if (!isProbablyMenuItemName(name)) {
      continue;
    }

    const allergens = markers
      .map((marker) => closestAllergenColumn(marker.x, columns, 18))
      .filter(Boolean);

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: "Official CAVA nutrition and allergen guide PDF.",
        imageUrl: null,
        mayContain: [],
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function parseCavaNutritionRow(items) {
  const values = [];

  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (!isNutritionValueToken(items[index].str)) {
      break;
    }

    values.unshift(items[index].str);
  }

  if (values.length < 11) {
    return null;
  }

  const name = cleanText(
    items
      .slice(0, items.length - values.length)
      .map((item) => item.str)
      .join(" "),
  );

  if (!name || !isProbablyMenuItemName(name) || isCavaPdfNoise(name, name)) {
    return null;
  }

  return { name, values: values.slice(0, 11) };
}

function cavaNutritionCategory(rowText) {
  if (
    /^(?:CURATED BOWLS|PITAS|GREENS\/GRAINS|TOPPINGS|DRESSINGS|DRINKS)$/i.test(
      rowText,
    )
  ) {
    return titleCase(rowText);
  }

  return null;
}

function nutritionFactsFromCavaValues(values) {
  return normalizeNutritionFacts({
    Calories: values[0],
    "Calories from Fat": values[1],
    "Total Fat": values[2],
    "Saturated Fat": values[3],
    "Trans Fat": values[4],
    Cholesterol: values[5],
    Sodium: values[6],
    "Total Carbohydrates": values[7],
    "Dietary Fiber": values[8],
    Sugars: values[9],
    Protein: values[10],
  });
}

function isCavaPdfNoise(rowText, name) {
  return (
    /^(?:Recipe|Wheat|Shellfish|Contains|ALLERGEN|D I E T|Allergen Guide|While we|We cannot|including salmon|beverage information|-- \d+ of \d+ --)$/i.test(
      rowText,
    ) ||
    /^(?:beverage information is calculated without ice\.|Contains Compliant Ingredients)$/i.test(
      name,
    )
  );
}

async function extractYardHouseAllergenPdfItems(buffer, restaurant, url) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 5);
  const columns = [
    { allergen: "peanut", x: 350 },
    { allergen: "tree-nut", x: 382 },
    { allergen: "soy", x: 426 },
    { allergen: "egg", x: 457 },
    { allergen: "milk", x: 492 },
    { allergen: "wheat", x: 524 },
    { allergen: "gluten", x: 558 },
    { allergen: "fish", x: 596 },
    { allergen: "shellfish", x: 623 },
    { allergen: "shellfish", x: 660 },
    { allergen: "sesame", x: 700 },
  ];
  const broadCrossContactAllergens = [
    "peanut",
    "tree-nut",
    "soy",
    "egg",
    "milk",
    "wheat",
    "gluten",
    "fish",
    "shellfish",
    "sesame",
  ];
  const records = [];
  let currentCategory = restaurant.category;

  for (const row of rows) {
    const rowText =
      cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const name = cleanYardHousePdfName(
      row.items
        .filter((item) => item.x < 280)
        .map((item) => item.str)
        .join(" "),
    );

    if (!name || isYardHousePdfNoise(rowText, name)) {
      continue;
    }

    const markers = row.items.filter(
      (item) => /^[Y●]$/i.test(item.str) && item.x >= 280,
    );

    if (markers.length === 0) {
      if (isCategoryLine(name) || /^[A-Z][A-Z\s&+'"-]+$/.test(name)) {
        currentCategory = cleanYardHouseCategoryName(name);
      }
      continue;
    }

    if (!isProbablyMenuItemName(name)) {
      continue;
    }

    const allergens = [];
    const mayContain = [];
    const hasPrepCrossContact = markers.some(
      (marker) => /^●$/.test(marker.str) && marker.x >= 280 && marker.x <= 340,
    );

    if (hasPrepCrossContact) {
      mayContain.push(...broadCrossContactAllergens);
    }

    for (const marker of markers) {
      if (/^●$/.test(marker.str) && marker.x >= 280 && marker.x <= 340) {
        continue;
      }

      const allergen = closestAllergenColumn(marker.x, columns, 18);

      if (!allergen) {
        continue;
      }

      if (/^●$/.test(marker.str)) {
        mayContain.push(allergen);
      } else {
        allergens.push(allergen);
      }
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: "Official Yard House allergen guide PDF.",
        evidenceText:
          mayContain.length > 0
            ? "Official Yard House allergen guide row parsed; preparation marker indicates cross-contact risk."
            : "Official Yard House allergen guide PDF.",
        imageUrl: null,
        mayContain,
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function cleanYardHousePdfName(value) {
  return cleanText(value)?.replace(/\s+/g, " ").replace(/\s+²$/g, "").trim();
}

function cleanYardHouseCategoryName(value) {
  return titleCase(value)
    .replace(/\bSandwi Ches\b/g, "Sandwiches")
    .replace(/\bSandwi Ch Si Des\b/g, "Sandwich Sides")
    .replace(/\bAppeti Zers\b/g, "Appetizers")
    .replace(/\bChi Cken\b/g, "Chicken")
    .replace(/\bPreparati On\b/g, "Preparation")
    .replace(/\bPi Zzas\b/g, "Pizzas")
    .replace(/^Gs\b/g, "Gluten-Sensitive")
    .replace(/\bM Ai Ns\b/g, "Mains")
    .replace(/\bSi Des\b/g, "Sides")
    .replace(/\bSweet\b/g, "Sweets")
    .replace(/^Ki D'S M Enu$/g, "Kids Menu");
}

function isYardHousePdfNoise(rowText, name) {
  return (
    /^(?:KEY TO|KEY TO THI S GUI DE|ALLERGEN GUIDE|Printed information|The information|current version|grill or fryer|If you have|COMMON ALLERGENS|PREPARATION|Fried|Soybean Oil|Grilled|Peanuts Tree Nuts|Menu items marked|Dairy|Page \d+ of \d+|-- \d+ of \d+ --)$/i.test(
      rowText,
    ) ||
    /^(?:KEY TO THI S GUI DE|Peanuts|Tree Nuts|Soy|Eggs|Fish|Molluscs|Crustacean|Sesame|Dairy|Wheat|Gluten|served with pickles and choice of side|served lettuce wrapped|served on flour tortillas|served on corn tortillas)$/i.test(
      name,
    )
  );
}

async function extractYardHouseNutritionPdfItems(buffer, restaurant, url) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 4);
  const records = [];
  let currentCategory = restaurant.category;

  for (const row of rows.filter((entry) => entry.pageNumber >= 3)) {
    const rowText =
      cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const name = cleanYardHousePdfName(
      row.items
        .filter((item) => item.x < 300)
        .map((item) => item.str)
        .join(" "),
    );
    const nutritionFacts = nutritionFactsFromYardHouseRow(row.items);

    if (!rowText || isYardHouseNutritionNoise(rowText)) {
      continue;
    }

    if (name && Object.keys(nutritionFacts ?? {}).length === 0) {
      if (isCategoryLine(name) || /^[A-Z][A-Z\s&+'"-]+$/.test(name)) {
        currentCategory = cleanYardHouseCategoryName(name);
      }
      continue;
    }

    if (
      !name ||
      !nutritionFacts ||
      Object.keys(nutritionFacts).length === 0 ||
      parseNutritionNumber(nutritionFacts.Calories) === null ||
      !isProbablyMenuItemName(name)
    ) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.unavailable,
        allergens: [],
        category: currentCategory,
        description: "Official Yard House nutrition guide PDF.",
        imageUrl: null,
        mayContain: [],
        name,
        nutritionFacts,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function nutritionFactsFromYardHouseRow(items) {
  const valueAt = (targetX, tolerance = 15) =>
    cleanText(
      items.find((item) => Math.abs(item.x - targetX) <= tolerance)?.str,
    );

  return normalizeNutritionFacts({
    Calories: valueAt(322),
    "Calories from Fat": valueAt(357),
    "Total Fat": valueAt(390),
    "Saturated Fat": valueAt(425),
    "Trans Fat": valueAt(463),
    Cholesterol: valueAt(500),
    Protein: valueAt(541),
    Sodium: valueAt(576),
    "Total Carbohydrates": valueAt(616),
    "Dietary Fiber": valueAt(657),
    Sugars: valueAt(696),
  });
}

function isYardHouseNutritionNoise(rowText) {
  return /^(?:INFORMATION IS VALID|NUTRITIONAL GUIDE|ALLERGEN GUIDE|GLUTEN|VEGETARIAN|VEGAN|Food & Beverage Nutrition Guide|Valid June|Yard House has|current nutrition|for general|menu items|noted under|about this|Calories|from Fat|Total Fat|Saturated Fat|Trans Fat|Cholesterol|Protein|Sodium|Total Carbs|Dietary Fiber|Sugars|Menu Item|Page \d+ of \d+|#N\/A)$/i.test(
    rowText,
  );
}

async function extractCheddarsAllergenPdfItems(buffer, restaurant, url) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 5);
  const columns = [
    { allergen: "peanut", x: 716 },
    { allergen: "tree-nut", x: 775 },
    { allergen: "soy", x: 852 },
    { allergen: "egg", x: 912 },
    { allergen: "milk", x: 974 },
    { allergen: "wheat", x: 1034 },
    { allergen: "fish", x: 1101 },
    { allergen: "shellfish", x: 1154 },
    { allergen: "shellfish", x: 1217 },
    { allergen: "gluten", x: 1284 },
    { allergen: "sesame", x: 1344 },
  ];
  const records = [];
  let currentCategory = restaurant.category;

  for (const row of rows) {
    const rowText =
      cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const name = cleanText(
      row.items
        .filter((item) => item.x < 545)
        .map((item) => item.str)
        .join(" "),
    );

    if (!name || isCheddarsPdfNoise(rowText, name)) {
      continue;
    }

    const markers = row.items.filter(
      (item) => /^X$/i.test(item.str) && item.x >= 545,
    );

    if (markers.length === 0) {
      if (isCategoryLine(name) || /^[A-Z][A-Z\s&'/-]+$/.test(name)) {
        currentCategory = titleCase(name);
      }
      continue;
    }

    if (!isProbablyMenuItemName(name)) {
      continue;
    }

    const allergens = markers
      .map((marker) => closestAllergenColumn(marker.x, columns, 24))
      .filter(Boolean);

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: "Official Cheddar's Scratch Kitchen allergen guide PDF.",
        imageUrl: null,
        mayContain: [],
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function isCheddarsPdfNoise(rowText, name) {
  return (
    /^(?:X Menu Item|Includes all|Fried in Soybean|Oil Grilled|Peanuts|Tree Nuts|Molluscan|Crustacean|Shellfish|Food Allergen Guide|Printed information|The information|most current|cooked on|If you have|-- \d+ of \d+ --)$/i.test(
      rowText,
    ) ||
    /^(?:Sides? not included|Side not included|dressing not included)$/i.test(
      name,
    )
  );
}

async function extractCheddarsNutritionPdfItems(buffer, restaurant, url) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 4);
  const records = [];
  let currentCategory = restaurant.category;
  let pendingPrefix = null;

  for (const row of rows) {
    const rowText =
      cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const name = cleanText(
      row.items
        .filter((item) => item.x < 520)
        .map((item) => item.str)
        .join(" "),
    );
    const nutritionFacts = nutritionFactsFromCheddarsRow(row.items);

    if (!rowText || isCheddarsNutritionNoise(rowText)) {
      continue;
    }

    if (name && Object.keys(nutritionFacts ?? {}).length === 0) {
      if (isCategoryLine(name) || /^[A-Z][A-Z\s&'/-]+$/.test(name)) {
        currentCategory = titleCase(name);
        pendingPrefix = null;
      } else if (isProbablyMenuItemName(name)) {
        pendingPrefix = name;
      }
      continue;
    }

    if (!name || !nutritionFacts || Object.keys(nutritionFacts).length === 0) {
      continue;
    }

    const itemName = pendingPrefix ? `${pendingPrefix} ${name}` : name;

    if (!isProbablyMenuItemName(itemName)) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.unavailable,
        allergens: [],
        category: currentCategory,
        description: "Official Cheddar's Scratch Kitchen nutrition guide PDF.",
        imageUrl: null,
        mayContain: [],
        name: itemName,
        nutritionFacts,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
    pendingPrefix = null;
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function nutritionFactsFromCheddarsRow(items) {
  const valueAt = (targetX, tolerance = 20) =>
    cleanText(
      items.find((item) => Math.abs(item.x - targetX) <= tolerance)?.str,
    );

  return normalizeNutritionFacts({
    Calories: valueAt(539),
    "Calories from Fat": valueAt(617),
    "Total Fat": valueAt(691),
    "Saturated Fat": valueAt(766),
    "Trans Fat": valueAt(850),
    Cholesterol: valueAt(934),
    Protein: valueAt(1027),
    Sodium: valueAt(1112),
    "Total Carbohydrates": valueAt(1208),
    "Dietary Fiber": valueAt(1297),
    Sugars: valueAt(1380),
  });
}

function isCheddarsNutritionNoise(rowText) {
  return /^(?:Food & Beverage Nutrition Guide|Printed information|Cheddar's Scratch Kitchen|what is actually|If you have|Calories from|Menu Item|Fat|Total Fat|Saturated Fat|Trans Fat|Cholesterol|Protein|Sodium|Total Carbs|Dietary Fiber|Sugars|-- \d+ of \d+ --)$/i.test(
    rowText,
  );
}

async function extractAuntieAnnesAllergenPdfItems(buffer, restaurant, url) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 4);
  const columns = [
    { allergen: "milk", x: 323 },
    { allergen: "egg", x: 363 },
    { allergen: "fish", x: 403 },
    { allergen: "shellfish", x: 443 },
    { allergen: "wheat", x: 495 },
    { allergen: "soy", x: 554 },
    { allergen: "peanut", x: 619 },
    { allergen: "tree-nut", x: 677 },
  ];
  const records = [];
  let currentCategory = restaurant.category;

  for (const row of rows) {
    const rowText =
      cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const name = cleanAuntieAnnesPdfName(
      row.items
        .filter((item) => item.x < 300)
        .map((item) => item.str)
        .join(" "),
    );

    if (!name || isAuntieAnnesPdfNoise(rowText, name)) {
      continue;
    }

    const markers = row.items.filter(
      (item) => /^X$/i.test(item.str) && item.x >= 300,
    );
    const categoryHeading = auntieAnnesCategoryHeading(name);

    if (markers.length === 0) {
      if (categoryHeading) {
        currentCategory = categoryHeading;
        continue;
      }

      if (!isProbablyMenuItemName(name)) {
        continue;
      }

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens: [],
          category: currentCategory,
          description:
            "Official Auntie Anne's allergen and sensitivities PDF matrix.",
          imageUrl: null,
          mayContain: [],
          name: titleCase(name),
          sourceKind: "pdf-matrix",
          sourceUrl: url,
          variantGroup: currentCategory,
        }),
      );
      continue;
    }

    if (!isProbablyMenuItemName(name)) {
      continue;
    }

    const allergens = markers
      .map((marker) => closestAllergenColumn(marker.x, columns, 22))
      .filter(Boolean);

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description:
          "Official Auntie Anne's allergen and sensitivities PDF matrix.",
        imageUrl: null,
        mayContain: [],
        name: titleCase(name),
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

async function extractAuntieAnnesNutritionPdfItems(buffer, restaurant, url) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 4);
  const records = [];
  let currentCategory = restaurant.category;

  for (const row of rows) {
    const rowText =
      cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const category = auntieAnnesNutritionCategory(rowText);

    if (category) {
      currentCategory = category;
      continue;
    }

    const parsed = parseAuntieAnnesNutritionRow(row.items);

    if (!parsed) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.unavailable,
        allergens: [],
        category: currentCategory,
        description: "Official Auntie Anne's nutrition guide PDF.",
        imageUrl: null,
        mayContain: [],
        name: parsed.name,
        nutritionFacts: nutritionFactsFromAuntieAnnesValues(
          parsed.servingSize,
          parsed.values,
        ),
        sourceKind: "pdf-nutrition",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function parseAuntieAnnesNutritionRow(items) {
  const values = [];

  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (!isNutritionValueToken(items[index].str)) {
      break;
    }

    values.unshift(items[index].str);
  }

  if (values.length < 11) {
    return null;
  }

  const prefix = items
    .slice(0, items.length - values.length)
    .map((item) => item.str);
  const servingIndex = prefix.findIndex((part) =>
    /^(?:1 each|Approx|Small|Medium|Large|\d+(?:\.\d+)?\s*oz|1 cup|1 container)/i.test(
      part,
    ),
  );

  if (servingIndex <= 0) {
    return null;
  }

  const name = cleanAuntieAnnesPdfName(prefix.slice(0, servingIndex).join(" "));
  const servingSize = cleanText(prefix.slice(servingIndex).join(" "));

  if (
    !name ||
    !servingSize ||
    !isProbablyMenuItemName(name) ||
    isAuntieAnnesPdfNoise(name, name)
  ) {
    return null;
  }

  return { name: titleCase(name), servingSize, values: values.slice(0, 11) };
}

function auntieAnnesNutritionCategory(rowText) {
  if (
    /^(?:PRETZELS|PRETZEL NUGGETS|PRETZEL DOGS|DIPS|BEVERAGES|CATERING|BREAKFAST)$/i.test(
      rowText,
    )
  ) {
    return titleCase(rowText);
  }

  return null;
}

function nutritionFactsFromAuntieAnnesValues(servingSize, values) {
  return normalizeNutritionFacts({
    "Serving Size": servingSize,
    Calories: values[0],
    "Total Fat": values[1],
    "Saturated Fat": values[2],
    "Trans Fat": values[3],
    Cholesterol: values[4],
    Sodium: values[5],
    "Total Carbohydrates": values[6],
    "Dietary Fiber": values[7],
    Sugars: values[8],
    "Added Sugars": values[9],
    Protein: values[10],
  });
}

function cleanAuntieAnnesPdfName(value) {
  return cleanText(value)?.replace(/\s+/g, " ").trim();
}

function isAuntieAnnesPdfNoise(rowText, name) {
  if (/^Food Allergens and Sensitivities/i.test(name)) {
    return true;
  }

  return (
    /^(?:Food Allergens|Food Sensitivities|THIS CHART|Product|MILK|EGG|FISH|SHELL|TREE|FD&C|MONOSODIUM|GLUTAMATE|MSG|CORN|SULFITES|Please be advised|responsibility|condition or sensitivity|ingredient|questions related|Auntie Anne's LLC|Confidential|Revised|-- \d+ of \d+ --)$/i.test(
      rowText,
    ) ||
    /^(?:Food Allergens|Confidential|Revised|Auntie Anne's LLC)$/i.test(name) ||
    (/^(?:MISCELLANEOUS|PRETZELS \(without butter\)|DIPS|BEVERAGES)$/i.test(
      name,
    ) === false &&
      name.length < 3)
  );
}

function auntieAnnesCategoryHeading(name) {
  const headings = new Map([
    ["PRETZELS (without butter)", "Pretzels"],
    ["DIPS", "Dips"],
    ["BEVERAGES", "Beverages"],
    ["MISCELLANEOUS", "Miscellaneous"],
  ]);

  return headings.get(name.toUpperCase()) ?? null;
}

async function extractTimHortonsAllergenPdfItems(buffer, restaurant, url) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 3);
  const columns = [
    { allergen: "wheat", x: 275 },
    { allergen: "gluten", x: 275 },
    { allergen: "milk", x: 329 },
    { allergen: "egg", x: 383 },
    { allergen: "soy", x: 437 },
    { allergen: "peanut", x: 491 },
    { allergen: "tree-nut", x: 544 },
    { allergen: "sesame", x: 599 },
    { allergen: "fish", x: 653 },
    { allergen: "shellfish", x: 695 },
  ];
  const records = [];
  let currentCategory = restaurant.category;
  let pendingRecord = null;

  for (const row of rows) {
    const rowText =
      cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const leftText = cleanTimHortonsPdfName(
      row.items
        .filter((item) => item.x < 250)
        .map((item) => item.str)
        .join(" "),
    );

    if (isTimHortonsPdfNoise(rowText, leftText ?? "")) {
      continue;
    }

    const markers = row.items.filter(
      (item) => /^[xo]$/i.test(item.str) && item.x >= 250,
    );

    if (markers.length === 0) {
      const categoryText = leftText || rowText;
      const categoryHeading = timHortonsCategoryHeading(categoryText);
      if (categoryHeading) {
        if (pendingRecord) {
          records.push(createRecord(pendingRecord));
        }
        currentCategory = categoryHeading;
        pendingRecord = null;
      } else if (leftText && isProbablyMenuItemName(leftText)) {
        if (pendingRecord) {
          records.push(createRecord(pendingRecord));
        }
        pendingRecord = {
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens: [],
          category: currentCategory,
          description: "Official Tim Hortons USA allergen guide PDF.",
          imageUrl: null,
          mayContain: [],
          name: leftText,
          sourceKind: "pdf-matrix",
          sourceUrl: url,
          variantGroup: currentCategory,
        };
      }
      continue;
    }

    if (pendingRecord && leftText && leftText !== pendingRecord.name) {
      records.push(createRecord(pendingRecord));
      pendingRecord = null;
    }

    const name = leftText || pendingRecord?.name;

    if (!name || !isProbablyMenuItemName(name)) {
      pendingRecord = null;
      continue;
    }

    const allergens = [];
    const mayContain = [];

    for (const marker of markers) {
      const allergen = closestAllergenColumn(marker.x, columns, 18);

      if (!allergen) {
        continue;
      }

      if (/^o$/i.test(marker.str)) {
        mayContain.push(allergen);
      } else {
        allergens.push(allergen);
      }
    }

    if (pendingRecord) {
      pendingRecord = null;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens: uniqueStrings(allergens),
        category: currentCategory,
        description: "Official Tim Hortons USA allergen guide PDF.",
        imageUrl: null,
        mayContain: uniqueStrings(mayContain),
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  if (pendingRecord) {
    records.push(createRecord(pendingRecord));
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function cleanTimHortonsPdfName(value) {
  return cleanText(value)?.replace(/\s+/g, " ").trim();
}

function isTimHortonsPdfNoise(rowText, name) {
  return (
    /^(?:Wheat &|Gluten|Menu Item|Milk|Egg|Soy|Peanuts|Tree Nuts|Sesame|Fish|Shellfish|x = Contains|o = May Contain|Page \d+ of \d+|-- \d+ of \d+ --|Tim Hortons USA|Allergen Information|Allergen Statement|Although precaution|This guide|Please consult|A blank field|To find out|Some of our|Beverages - Limited Time Only|Cold Beverages - Limited Time Only|©Tim Hortons)/i.test(
      rowText,
    ) || /^(?:Tim Hortons USA|Allergen Information|©Tim Hortons)/i.test(name)
  );
}

function timHortonsCategoryHeading(value) {
  const headings = new Set([
    "Coffee, Tea & Other Hot Beverages",
    "Beverage Additions",
    "Cold Beverages",
    "Donuts",
    "Timbits®",
    "Baked Goods",
    "Muffins",
    "Cookies",
    "Croissants",
    "Bagels",
    "Bagel Toppings",
    "Breakfast",
    "Classic Breakfast Sandwiches",
    "Bagel Breakfast Sandwiches",
    "Grilled Breakfast Wraps",
    "Other Breakfast Items",
    "Lunch",
    "Sandwiches",
    "Wraps",
    "Paninis",
    "Soups & Chili",
    "Sides",
  ]);
  const normalized = cleanText(value);

  return headings.has(normalized) ? normalized : null;
}

function extractDunkinAllergyIngredientPdfItems(text, restaurant, url) {
  const normalizedText = text
    .replace(/--\s*\d+\s+of\s+\d+\s*--/g, " ")
    .replace(/\r/g, "");
  const blocks = normalizedText
    .split(/\nPRODUCT NAME\s+/)
    .slice(1)
    .map((block) => `PRODUCT NAME ${block}`);
  const records = [];

  for (const block of blocks) {
    const name = extractDunkinPdfField(
      block,
      /^PRODUCT NAME\s+([\s\S]*?)\nCATEGORY\s+/,
    );
    const category = extractDunkinPdfField(
      block,
      /\nCATEGORY\s+([\s\S]*?)(?:\nFLAVOR\s+|\nINGREDIENTS\s+)/,
    );
    const flavor = extractDunkinPdfField(
      block,
      /\nFLAVOR\s+([\s\S]*?)\nINGREDIENTS\s+/,
    );
    const ingredientsText = extractDunkinPdfField(
      block,
      /\nINGREDIENTS\s+([\s\S]*?)\nALLERGENS\b/,
    );
    const allergenText = extractDunkinPdfField(
      block,
      /\nALLERGENS\b\s*([\s\S]*?)(?:\nWARNING\b|$)/,
    );
    const warningText = extractDunkinPdfField(
      block,
      /\nWARNING\b\s*([\s\S]*?)$/,
    );

    if (!name || !ingredientsText || !isProbablyMenuItemName(name)) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens: normalizeDunkinAllergenList(allergenText),
        category: category ?? restaurant.category,
        description: "Official Dunkin' allergen and ingredient guide PDF.",
        imageUrl: null,
        ingredientsText,
        mayContain: normalizeDunkinMayContainList(warningText),
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: flavor,
      }),
    );
  }

  return records;
}

function extractDunkinPdfField(block, pattern) {
  const value = block.match(pattern)?.[1];

  return cleanText(value);
}

function normalizeDunkinAllergenList(text) {
  const cleaned = cleanText(text);

  if (!cleaned || /^none$/i.test(cleaned)) {
    return [];
  }

  return normalizeProviderAllergens(
    cleaned.split(/\s*,\s*|\s+&\s+|\s+and\s+/i),
  );
}

function normalizeDunkinMayContainList(text) {
  const cleaned = cleanText(text)?.replace(/^may contain\s+/i, "");

  return normalizeDunkinAllergenList(cleaned);
}

async function extractDunkinNutritionPdfItems(buffer, restaurant, url) {
  const pdfjsLib = await getPdfJsLib();
  const document = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
    .promise;
  const lines = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    lines.push(
      ...textContent.items.map((item) => cleanText(item.str)).filter(Boolean),
    );
  }

  const records = [];
  let currentCategory = restaurant.category;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (isDunkinNutritionCategory(line, lines[index + 1])) {
      currentCategory = titleCase(line);
      continue;
    }

    const servingSize = cleanText(lines[index + 1]);
    const values = lines.slice(index + 2, index + 17);

    if (
      !line ||
      !servingSize ||
      !isProbablyMenuItemName(line) ||
      values.length < 15 ||
      !values.every((value) => parseNutritionNumber(value) !== null)
    ) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.unavailable,
        allergens: [],
        category: currentCategory,
        description: "Official Dunkin' nutrition guide PDF.",
        imageUrl: null,
        mayContain: [],
        name: cleanText(line.replace(/\s+-\s*$/g, "")),
        nutritionFacts: nutritionFactsFromDunkinValues(servingSize, values),
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
    index += 16;
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function isDunkinNutritionCategory(line, nextLine) {
  return Boolean(
    line &&
      nextLine === "Serving Size" &&
      !/^(?:Nutrition Guide|The information|Before placing|Limited Time Products)$/i.test(
        line,
      ),
  );
}

function nutritionFactsFromDunkinValues(servingSize, values) {
  const labels = [
    "Calories",
    "Total Fat",
    "Saturated Fat",
    "Trans Fat",
    "Cholesterol",
    "Sodium",
    "Total Carbohydrates",
    "Dietary Fiber",
    "Sugars",
    "Added Sugars",
    "Protein",
    "Vitamin D",
    "Potassium",
    "Calcium",
    "Iron",
  ];
  const facts = { "Serving Size": servingSize };

  labels.forEach((label, index) => {
    facts[label] = parseNutritionNumber(values[index]) ?? values[index];
  });

  return normalizeNutritionFacts(facts);
}

function extractChipotleNutritionPdfItems(text, restaurant, url) {
  const records = [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const parts = line.split(/\t+/).map(cleanText).filter(Boolean);

    if (parts.length < 13) {
      continue;
    }

    const name = normalizeChipotleNutritionName(parts[0]);
    const nutritionFacts = nutritionFactsFromChipotleParts(parts);

    if (
      !name ||
      Object.keys(nutritionFacts ?? {}).length === 0 ||
      !isProbablyMenuItemName(name)
    ) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.unavailable,
        allergens: [],
        category: restaurant.category,
        description: "Official Chipotle nutrition facts PDF.",
        imageUrl: null,
        mayContain: [],
        name,
        nutritionFacts,
        sourceKind: "pdf-nutrition",
        sourceUrl: url,
      }),
    );
  }

  return uniqueBy(records, (record) => record.name);
}

function normalizeChipotleNutritionName(value) {
  const raw = cleanText(value)?.replace(/\*/g, "").trim();

  if (/\bflour tortilla\s*\(\s*burrito\s*\)/i.test(raw ?? "")) {
    return "Flour Tortilla (Burrito)";
  }

  if (/\bflour tortilla\s*\(\s*taco\s*\)/i.test(raw ?? "")) {
    return "Flour Tortilla (Taco)";
  }

  const cleaned = raw
    ?.replace(
      /\s*\([^)]*(?:large|side|regular|topping\/side|entre[eé]|tacos|burrito)[^)]*\)\s*$/i,
      "",
    )
    .trim();
  const aliases = new Map([
    ["Cheese", "Monterey Jack Cheese"],
    ["Chips", "Tortilla Chips"],
    ["Cilantro-Lime Brown Rice", "Brown Rice"],
    ["Cilantro-Lime White Rice", "White Rice"],
    ["Guacamole", "Guacamole"],
    ["Queso Blanco", "Queso Blanco"],
    ["Romaine Lettuce", "Romaine Lettuce"],
    ["Supergreens Salad Mix", "Supergreens Lettuce Blend"],
    ["Tomatillo-Green Chili Salsa", "Tomatillo Green-Chili Salsa"],
    ["Tomatillo-Red Chili Salsa", "Tomatillo Red-Chili Salsa"],
  ]);

  return aliases.get(cleaned) ?? cleaned;
}

function nutritionFactsFromChipotleParts(parts) {
  return normalizeNutritionFacts({
    "Serving Size": parts[1],
    Calories: parts[2],
    "Calories from Fat": parts[3],
    "Total Fat": parts[4],
    "Saturated Fat": parts[5],
    "Trans Fat": parts[6],
    Cholesterol: parts[7],
    Sodium: parts[8],
    "Total Carbohydrates": parts[9],
    "Dietary Fiber": parts[10],
    Sugars: parts[11],
    Protein: parts[12],
  });
}

async function extractPaneraAllergenPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const allergenColumns = [
    { id: "wheat", x: 294 },
    { id: "gluten", x: 294 },
    { id: "tree-nut", x: 345 },
    { id: "peanut", x: 392 },
    { id: "milk", x: 453 },
    { id: "soy", x: 510 },
    { id: "egg", x: 566 },
    { id: "fish", x: 626 },
    { id: "shellfish", x: 626 },
    { id: "sesame", x: 694 },
  ];
  const records = [];
  let currentCategory = restaurant.category;
  let pendingName = null;

  for (const row of rows) {
    const rowText = cleanText(row.items.map((item) => item.str).join(" "));

    if (
      !rowText ||
      /^(Product|Wheat|Tree Nuts|sources\)|oil\)|Allergen Guide|EDITION|VALID FOR|Below is|NOTE:|To access|•|Page \d+)$/i.test(
        rowText,
      )
    ) {
      continue;
    }

    const category = paneraCategoryFromRow(row.items);

    if (category) {
      currentCategory = category;
      pendingName = null;
      continue;
    }

    const name = cleanText(
      row.items
        .filter((item) => item.x < 270)
        .map((item) => item.str)
        .join(" "),
    );
    const markerItems = row.items.filter((item) => item.x >= 270);
    const hasMarkers = markerItems.some((item) =>
      /^(yes|may contain|no major allergens present)$/i.test(item.str),
    );

    if (!hasMarkers) {
      if (name && isProbablyMenuItemName(name)) {
        pendingName = pendingName ? `${pendingName} ${name}` : name;
      }

      continue;
    }

    const itemName = name && isProbablyMenuItemName(name) ? name : pendingName;

    if (!itemName || !isProbablyMenuItemName(itemName)) {
      pendingName = null;
      continue;
    }

    const direct = [];
    const mayContain = [];

    for (const marker of markerItems) {
      const markerText = cleanText(marker.str);

      if (!markerText || /^no major allergens present$/i.test(markerText)) {
        continue;
      }

      const matchedColumns = allergenColumns.filter(
        (column) => Math.abs(marker.x - column.x) <= 18,
      );

      if (/^may contain$/i.test(markerText)) {
        mayContain.push(...matchedColumns.map((column) => column.id));
      } else if (/^yes$/i.test(markerText)) {
        direct.push(...matchedColumns.map((column) => column.id));
      }
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens: direct,
        category: currentCategory,
        description: "Official Panera allergen guide PDF.",
        imageUrl: null,
        mayContain,
        name: itemName,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
      }),
    );
    pendingName = null;
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function paneraCategoryFromRow(items) {
  const text = cleanText(
    items
      .filter((item) => item.x < 270)
      .map((item) => item.str)
      .join(" "),
  );
  const categories = new Set([
    "Bagels & Spreads",
    "Breads",
    "Baked Goods",
    "Breakfast- Egg Sandwiches, Souffles, Parfait, Fruit & Oatmeal",
    "Salads & Stuffers",
    "Sandwiches- Information is provided with default bread choice. If bread choice is changed, it may contain an allergen.",
    "Dressings, Sauces & Spreads",
    "Drinks",
    "Soups & Mac",
    "Non-traditional Grab N Go",
    "Sides, Toppings, & Sauces",
    "Espresso Beverages",
    "Beverages",
    "Kids",
  ]);

  return text && categories.has(text)
    ? text.replace(/\s*-\s*Information.*$/i, "")
    : null;
}

async function extractPaneraNutritionPdfItems(buffer, restaurant, url) {
  const pdfjsLib = await getPdfJsLib();
  const document = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
    .promise;
  const lines = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    lines.push(
      ...textContent.items.map((item) => cleanText(item.str)).filter(Boolean),
    );
  }

  const records = [];
  let currentCategory = restaurant.category;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (isPaneraNutritionCategory(line)) {
      currentCategory = titleCase(line);
      continue;
    }

    const parsedRow = parsePaneraNutritionRow(lines, index);

    if (!parsedRow) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.unavailable,
        allergens: [],
        category: currentCategory,
        description: "Official Panera nutrition guide PDF.",
        imageUrl: null,
        mayContain: [],
        name: parsedRow.name,
        nutritionFacts: nutritionFactsFromPaneraValues(
          parsedRow.servingSize,
          parsedRow.values,
        ),
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
    index = parsedRow.nextIndex - 1;
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function parsePaneraNutritionRow(lines, index) {
  for (let namePartCount = 1; namePartCount <= 4; namePartCount += 1) {
    const nameParts = lines.slice(index, index + namePartCount);
    const name = cleanText(nameParts.join(" "));
    const servingSize = cleanText(lines[index + namePartCount]);
    const valuesStart = index + namePartCount + 1;
    const values = lines.slice(valuesStart, valuesStart + 12);

    if (
      name &&
      servingSize &&
      isProbablyMenuItemName(name) &&
      isPaneraServingSize(servingSize) &&
      values.length >= 12 &&
      values.every(isPaneraNutritionValue)
    ) {
      return {
        name,
        nextIndex: valuesStart + 12,
        servingSize,
        values,
      };
    }
  }

  return null;
}

function isPaneraNutritionCategory(line) {
  return Boolean(
    line &&
      /^[A-Z][A-Z0-9 '&/-]{3,}$/.test(line) &&
      !/^(?:Serving Size|Calories|Fat|Saturated Fat|Trans Fatty Acid|Cholesterol|Sodium|Carbohydrates|Total Dietary|Total Sugars|Protein|Caffeine|Approx|Beverages only|Page \d+|Edition|Effective)$/i.test(
        line,
      ),
  );
}

function isPaneraServingSize(value) {
  return Boolean(
    cleanText(value) &&
      /(?:\b(?:fl oz|oz|cup|cups|slice|slices|container|containers|portion|portions|dressing cup|bowl|sandwich|toast|wrap|bagel|cookie|muffin|pastry|mL|gram|g)\b|\d)/i.test(
        value,
      ),
  );
}

function isPaneraNutritionValue(value) {
  return (
    parseNutritionNumber(value) !== null ||
    /^(?:N\/A|less than 1)$/i.test(value ?? "")
  );
}

function paneraNutritionValue(value) {
  if (/^less than 1$/i.test(value ?? "")) {
    return value;
  }

  return parseNutritionNumber(value) ?? cleanText(value);
}

function nutritionFactsFromPaneraValues(servingSize, values) {
  const labels = [
    "Calories",
    "Calories from Fat",
    "Total Fat",
    "Saturated Fat",
    "Trans Fat",
    "Cholesterol",
    "Sodium",
    "Total Carbohydrates",
    "Dietary Fiber",
    "Sugars",
    "Protein",
    "Caffeine",
  ];
  const facts = { "Serving Size": servingSize };

  labels.forEach((label, index) => {
    facts[label] = paneraNutritionValue(values[index]);
  });

  return normalizeNutritionFacts(facts);
}

function extractArbysAllergenPdfItems(text, restaurant, url) {
  const records = [];
  const lines = text
    .replace(/--\s*\d+\s+of\s+\d+\s*--/g, " ")
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter(Boolean);
  let currentCategory = restaurant.category;
  let pending = "";

  for (const line of lines) {
    if (isArbysPdfNoiseLine(line)) {
      continue;
    }

    if (isArbysCategoryLine(line)) {
      currentCategory = titleCase(line);
      pending = "";
      continue;
    }

    const nutritionTail = line.match(
      /\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/,
    );

    if (!nutritionTail) {
      pending = pending ? `${pending} ${line}` : line;
      continue;
    }

    const combined = cleanText(`${pending} ${line}`) ?? line;
    pending = "";
    const label = cleanText(
      combined.replace(/\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?[\s\S]*$/, ""),
    );

    if (!label || !isProbablyMenuItemName(label)) {
      continue;
    }

    const name = cleanText(
      label
        .replace(/\s+Contains:.*$/i, "")
        .replace(/\s+May Contain:?.*$/i, "")
        .replace(/\s+†.*$/i, "")
        .replace(/\s+Adds$/i, ""),
    );

    if (!name || !isProbablyMenuItemName(name)) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens: normalizeProviderAllergens(
          extractArbysDisclosure(label, "contains"),
        ),
        category: currentCategory,
        description: "Official Arby's nutrition and allergen information PDF.",
        imageUrl: null,
        mayContain: normalizeProviderAllergens(
          extractArbysDisclosure(label, "may"),
        ),
        name,
        nutritionFacts: nutritionFactsFromArbysValues(nutritionTail.slice(1)),
        sourceKind: "pdf-matrix",
        sourceUrl: url,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function nutritionFactsFromArbysValues(values) {
  return normalizeNutritionFacts({
    "Serving Size": `${values[0]} g`,
    Calories: values[1],
    "Calories from Fat": values[2],
    "Total Fat": values[3],
    "Saturated Fat": values[4],
    "Trans Fat": values[5],
    Cholesterol: values[6],
    Sodium: values[7],
    "Total Carbohydrates": values[8],
    "Dietary Fiber": values[9],
    Sugars: values[10],
    Protein: values[11],
  });
}

function extractArbysIngredientsPdfItems(text, restaurant, url) {
  const records = [];
  const menuItemsSection = text.split(/--\s*2\s+of\s+7\s*--/)[0] ?? text;
  const lines = menuItemsSection
    .replace(/--\s*\d+\s+of\s+\d+\s*--/g, " ")
    .split(/\r?\n/)
    .map(cleanText)
    .filter(Boolean);
  let currentCategory = restaurant.category;
  let pending = null;

  for (const line of lines) {
    if (/^(Arby’s® Menu Items and Ingredients|Page \d+ of \d+)$/i.test(line)) {
      continue;
    }

    if (isArbysCategoryLine(line)) {
      if (pending) {
        records.push(
          createArbysIngredientRecord(pending, currentCategory, url),
        );
        pending = null;
      }

      currentCategory = titleCase(line);
      continue;
    }

    const startsNewItem = /^.{3,90}:\s+/.test(line);

    if (startsNewItem) {
      if (pending) {
        records.push(
          createArbysIngredientRecord(pending, currentCategory, url),
        );
      }

      const [rawName, ...detailParts] = line.split(":");
      pending = {
        name: cleanText(rawName),
        detail: cleanText(detailParts.join(":")),
      };
      continue;
    }

    if (pending) {
      pending.detail = cleanText(`${pending.detail ?? ""} ${line}`);
    }
  }

  if (pending) {
    records.push(createArbysIngredientRecord(pending, currentCategory, url));
  }

  return records.filter(Boolean);
}

function createArbysIngredientRecord(entry, category, url) {
  if (!entry.name || !isProbablyMenuItemName(entry.name)) {
    return null;
  }

  return createRecord({
    allergenSourceType: allergenSourceTypes.officialIngredients,
    allergens: [],
    category,
    description: "Official Arby's menu items and ingredients PDF.",
    imageUrl: null,
    ingredientsText: entry.detail ?? entry.name,
    mayContain: [],
    name: entry.name,
    sourceKind: "pdf-ingredients",
    sourceUrl: url,
  });
}

function extractArbysDisclosure(label, mode) {
  const pattern =
    mode === "may"
      ? /May Contain:?\s*([^;†\t]+)/gi
      : /Contains:\s*([^;†\t]+?)(?=\s+May Contain:?|$)/gi;
  const values = [];
  let match;

  while ((match = pattern.exec(label))) {
    values.push(...match[1].split(/\s*,\s*|\s+and\s+/i));
  }

  return values;
}

function isArbysPdfNoiseLine(line) {
  return /^(Serving Weight|Calories|Calories from Fat|Dietary Fiber|Fat - Total|Sugars|Saturated Fat|Protein|Trans Fat|Cholesterol|Sodium|Total Carbohydrate|Arby’s® Nutrition|Major food allergens|† Menu item|that contain major|Manufactured|• Menu item|Page \d+ of \d+)$/i.test(
    line,
  );
}

function isArbysCategoryLine(line) {
  return /^[A-Z0-9&’' /-]{3,70}$/.test(line) && !/\d/.test(line);
}

async function extractWingstopPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const allergenColumns = [
    { id: "wheat", x: 277 },
    { id: "milk", x: 340 },
    { id: "egg", x: 402 },
    { id: "soy", x: 464 },
    { id: "fish", x: 526 },
    { id: "shellfish", x: 526 },
    { id: "mustard", x: 589 },
    { id: "celery", x: 651 },
  ];
  const records = [];
  let currentCategory = restaurant.category;

  for (const row of rows) {
    const rowText =
      cleanText(row.items.map((item) => item.str).join(" ")) ?? "";

    if (
      /\b(?:ALLERGEN|SENSITIVITY|DECLARATION|Wheat|Dairy|Egg|Soy|Fish|Shellfish|Mustard|Celery)\b/i.test(
        rowText,
      ) &&
      !/^LTO:/i.test(rowText)
    ) {
      continue;
    }

    if (/^(?:PROTEIN|FLAVOR|DIPS|SIDES)$/i.test(rowText)) {
      currentCategory =
        {
          protein: "Protein",
          flavor: "Flavor",
          dips: "Dips",
          sides: "Sides",
        }[rowText.toLowerCase()] ?? restaurant.category;
      continue;
    }

    const name = cleanText(
      row.items
        .filter(
          (item) => item.x >= 90 && item.x <= 245 && !/^x$/i.test(item.str),
        )
        .map((item) => item.str)
        .join(" "),
    );

    if (!name || !isProbablyMenuItemName(name)) {
      continue;
    }

    const markers = row.items.filter((item) => /^x$/i.test(item.str));

    if (markers.length === 0) {
      continue;
    }

    const allergens = uniqueStrings(
      markers.flatMap((marker) =>
        allergenColumns
          .filter((column) => Math.abs(marker.x - column.x) <= 20)
          .map((column) => column.id),
      ),
    );
    const category = currentCategory ?? restaurant.category;

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category,
        description: "Official Wingstop allergen declaration PDF.",
        imageUrl: null,
        mayContain: wingstopMayContainAllergens(name),
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: name,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

async function extractWingstopNutritionPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const records = [];
  let currentCategory = restaurant.category;
  let pendingCategory = null;

  for (const row of rows) {
    const parts = row.items.map((item) => cleanText(item.str)).filter(Boolean);
    const rowText = cleanText(parts.join(" ")) ?? "";

    if (/^CLASSIC WINGS$/i.test(rowText)) {
      currentCategory = "Classic Wings";
      pendingCategory = null;
      continue;
    }

    if (/^BONELESS$/i.test(rowText)) {
      pendingCategory = "Boneless Wings";
      continue;
    }

    if (pendingCategory === "Boneless Wings" && /^WINGS$/i.test(rowText)) {
      currentCategory = "Boneless Wings";
      pendingCategory = null;
      continue;
    }

    if (/^CHICKEN$/i.test(rowText)) {
      pendingCategory = "Chicken";
      continue;
    }

    if (pendingCategory === "Chicken" && /^TENDERS$/i.test(rowText)) {
      currentCategory = "Chicken Tenders";
      pendingCategory = null;
      continue;
    }

    if (pendingCategory === "Chicken" && /^SANDWICH$/i.test(rowText)) {
      currentCategory = "Chicken Sandwich";
      pendingCategory = null;
      continue;
    }

    if (/^SIDES$/i.test(rowText)) {
      currentCategory = "Sides";
      pendingCategory = null;
      continue;
    }

    const parsed = parseWingstopNutritionRow(parts);

    if (!parsed) {
      continue;
    }

    for (const name of wingstopNutritionNames(parsed.name, currentCategory)) {
      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.unavailable,
          allergens: [],
          category: currentCategory,
          description: "Official Wingstop nutritional guide PDF.",
          imageUrl: null,
          mayContain: [],
          name,
          nutritionFacts: nutritionFactsFromWingstopValues(
            parsed.servingSize,
            parsed.values,
          ),
          sourceKind: "pdf-nutrition",
          sourceUrl: url,
          variantGroup: currentCategory,
        }),
      );
    }
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function parseWingstopNutritionRow(parts) {
  if (parts.length < 17) {
    return null;
  }

  const values = [];

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (!isNutritionValueToken(parts[index])) {
      break;
    }

    values.unshift(parts[index]);
  }

  if (values.length < 15) {
    return null;
  }

  const prefix = parts.slice(0, parts.length - values.length);
  const name = cleanText(prefix[0]);
  const servingSize = cleanText(prefix.slice(1).join(" "));

  if (!name || !servingSize || !isProbablyMenuItemName(name)) {
    return null;
  }

  return { name, servingSize, values: values.slice(0, 15) };
}

function wingstopNutritionNames(name, category) {
  const names = new Set([name]);

  if (/Classic Wings/i.test(category)) {
    names.add(`${name} (Classic Wings)`);
  } else if (/Boneless Wings/i.test(category)) {
    names.add(`${name} (Boneless Wings)`);
  } else if (/Chicken Tenders/i.test(category)) {
    names.add(`${name} (Chicken Tenders)`);
  } else if (/Chicken Sandwich/i.test(category)) {
    names.add(`${name} (Chicken Sandwich)`);
  }

  if (/Cheddar Cheese Sauce Dip/i.test(name)) {
    names.add("Cheddar Cheese Sauce");
  }

  return Array.from(names);
}

function nutritionFactsFromWingstopValues(servingSize, values) {
  return normalizeNutritionFacts({
    "Serving Size": servingSize,
    Calories: values[0],
    "Total Fat": values[1],
    "Saturated Fat": values[2],
    "Trans Fat": values[3],
    Cholesterol: values[4],
    Sodium: values[5],
    "Total Carbohydrates": values[6],
    "Dietary Fiber": values[7],
    Sugars: values[8],
    "Added Sugars": values[9],
    Protein: values[10],
    "Vitamin D": values[11],
    Calcium: values[12],
    Iron: values[13],
    Potassium: values[14],
  });
}

function wingstopMayContainAllergens(name) {
  if (
    /\b(classic wings|boneless wings|chicken tenders|chicken sandwich|fries|fried corn)\b/i.test(
      name,
    )
  ) {
    return ["wheat", "gluten"];
  }

  return [];
}

async function extractPandaExpressPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const allergenColumns = [
    { id: "wheat", x: 598 },
    { id: "soy", x: 620 },
    { id: "peanut", x: 641 },
    { id: "tree-nut", x: 663 },
    { id: "fish", x: 684 },
    { id: "shellfish", x: 706 },
    { id: "egg", x: 728 },
    { id: "milk", x: 749 },
  ];
  const records = [];
  let currentCategory = restaurant.category;

  for (const row of rows) {
    const name = cleanText(
      row.items
        .filter((item) => item.x < 165)
        .map((item) => item.str)
        .join(" "),
    )?.replace(/\s+\)/g, ")");

    if (!name) {
      continue;
    }

    const hasNutrition = row.items.some(
      (item) => item.x >= 180 && item.x <= 585 && /^<?\d/.test(item.str),
    );

    if (!hasNutrition) {
      if (
        /^[A-Z][A-Z0-9’'&\s*]+$/.test(name) &&
        !/^(MENU ITEMS|NUTRITION|ALLERGEN|KID’S MEAL|KID'S MEAL|TM)$/i.test(
          name,
        )
      ) {
        currentCategory = titleCase(name.replace(/\*+$/, ""));
      }
      continue;
    }

    if (!isProbablyMenuItemName(name) || /^Spicy$/i.test(name)) {
      continue;
    }

    const allergens = [];

    for (const marker of row.items.filter((item) => /^Y$/i.test(item.str))) {
      const column = allergenColumns.find(
        (entry) => Math.abs(entry.x - marker.x) <= 9,
      );

      if (column) {
        allergens.push(column.id);
      }
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description:
          "Official Panda Express nutrition and allergen information PDF.",
        imageUrl: null,
        mayContain: [],
        name: name.replace(/\*$/, ""),
        nutritionFacts: nutritionFactsFromPandaExpressRow(row.items),
        sourceKind: "pdf-matrix",
        sourceUrl: url,
      }),
    );
  }

  return records;
}

function nutritionFactsFromPandaExpressRow(items) {
  const valueAt = (targetX, tolerance = 14) =>
    cleanText(
      items.find((item) => Math.abs(item.x - targetX) <= tolerance)?.str,
    );

  return normalizeNutritionFacts({
    "Serving Size": valueAt(185, 18),
    Calories: valueAt(240),
    "Calories from Fat": valueAt(273),
    "Total Fat": valueAt(308),
    "Saturated Fat": valueAt(343),
    "Trans Fat": valueAt(376),
    Cholesterol: valueAt(407),
    Sodium: valueAt(436),
    "Total Carbohydrates": valueAt(472),
    "Dietary Fiber": valueAt(507),
    Sugars: valueAt(537),
    Protein: valueAt(570),
  });
}

async function extractFiveGuysPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const allergenColumns = [
    { id: "shellfish", x: 472 },
    { id: "shellfish", x: 480 },
    { id: "egg", x: 502 },
    { id: "fish", x: 524 },
    { id: "wheat", x: 546 },
    { id: "gluten", x: 546 },
    { id: "milk", x: 568 },
    { id: "peanut", x: 590 },
    { id: "sesame", x: 612 },
    { id: "soy", x: 634 },
    { id: "tree-nut", x: 657 },
  ];
  const records = [];
  let currentCategory = restaurant.category;
  let inNutritionTable = false;

  for (const row of rows) {
    const rowText = cleanText(row.items.map((item) => item.str).join(" "));

    if (!rowText) {
      continue;
    }

    if (/^INGREDIENT LISTING$/i.test(rowText)) {
      break;
    }

    if (/Serving Size/i.test(rowText) && /Calories/i.test(rowText)) {
      inNutritionTable = true;
      continue;
    }

    const name = cleanText(
      row.items
        .filter((item) => item.x < 130)
        .map((item) => item.str)
        .join(" "),
    );

    if (!name) {
      continue;
    }

    if (
      /^[A-Z][A-Z0-9’'&\s/-]+$/.test(name) &&
      !/^(?:NUTRITION|ALLERGENS|FIVE GUYS|USA)$/i.test(name)
    ) {
      currentCategory = titleCase(name);
      continue;
    }

    if (!inNutritionTable || !isProbablyMenuItemName(name)) {
      continue;
    }

    const nutritionFacts = nutritionFactsFromFiveGuysRow(row.items);

    if (!nutritionFacts || Object.keys(nutritionFacts).length === 0) {
      continue;
    }

    const allergens = uniqueStrings(
      row.items
        .filter((item) => item.str === "•")
        .flatMap((marker) =>
          allergenColumns
            .filter((column) => Math.abs(marker.x - column.x) <= 10)
            .map((column) => column.id),
        ),
    );

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description:
          "Official Five Guys nutrition and allergen information PDF.",
        imageUrl: null,
        mayContain: [],
        name: name.replace(/\s+\)$/g, ")"),
        nutritionFacts,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function nutritionFactsFromFiveGuysRow(items) {
  const valueAt = (targetX, tolerance = 12) =>
    cleanText(
      items.find((item) => Math.abs(item.x - targetX) <= tolerance)?.str,
    );

  return normalizeNutritionFacts({
    "Serving Size": valueAt(137),
    Calories: valueAt(164),
    "Calories from Fat": valueAt(191),
    "Total Fat": valueAt(219),
    "Saturated Fat": valueAt(246),
    "Trans Fat": valueAt(273),
    Cholesterol: valueAt(299),
    Sodium: valueAt(325),
    "Total Carbohydrates": valueAt(354),
    "Dietary Fiber": valueAt(381),
    Sugars: valueAt(408),
    Protein: valueAt(438),
  });
}

async function extractZaxbysPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const allergenColumns = [
    { id: "milk", x: 275 },
    { id: "egg", x: 305 },
    { id: "wheat", x: 335 },
    { id: "soy", x: 365 },
    { id: "peanut", x: 395 },
    { id: "tree-nut", x: 425 },
    { id: "shellfish", x: 455 },
    { id: "sesame", x: 485 },
    { id: "fish", x: 515 },
    { id: "gluten", x: 575 },
  ];
  const sectionLabels = new Set(["2", "WITH EACH SAUCE", "(PROTEIN ONLY)"]);
  const records = [];
  let currentCategory = restaurant.category;

  for (const row of rows.filter((entry) => entry.pageNumber === 2)) {
    const markerItems = row.items.filter((item) => /^[∙•.]$/.test(item.str));
    const nameItems = row.items.filter(
      (item) => item.x >= 60 && item.x < 265 && !sectionLabels.has(item.str),
    );
    const joinedName = cleanText(nameItems.map((item) => item.str).join(" "));
    const rowText = cleanText(row.items.map((item) => item.str).join(" "));

    if (!rowText) {
      continue;
    }

    const inlineCategory = zaxbysCategoryFromRow(
      row.items.filter((item) => item.x < 90).map((item) => item.str),
    );

    if (inlineCategory) {
      currentCategory = inlineCategory;
    }

    if (markerItems.length === 0) {
      const category = zaxbysCategoryFromRow(row.items.map((item) => item.str));

      if (category) {
        currentCategory = category;
      }

      continue;
    }

    if (!joinedName || !isProbablyMenuItemName(joinedName)) {
      continue;
    }

    const allergens = [];

    for (const marker of markerItems) {
      const column = allergenColumns.find(
        (entry) => Math.abs(entry.x - marker.x) <= 8,
      );

      if (column) {
        allergens.push(column.id);
      }
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: zaxbysCategoryForItem(joinedName, currentCategory),
        description:
          "Official Zaxbys nutrition and allergen information guide PDF.",
        imageUrl: null,
        mayContain: [],
        name: joinedName,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
      }),
    );
  }

  return records;
}

export async function extractLittleCaesarsPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const allergenColumns = [
    { id: "egg", min: 496, max: 512 },
    { id: "milk", min: 513, max: 531 },
    { id: "wheat", min: 532, max: 550 },
    { id: "soy", min: 551, max: 573 },
  ];
  const records = [];
  let currentCategory = restaurant.category;
  let pendingName = null;
  let pendingMarkers = [];

  for (const row of rows) {
    const rowText = cleanText(row.items.map((item) => item.str).join(" "));

    if (
      !rowText ||
      /^(PRODUCT ALLERGEN INFORMATION|continued)$/i.test(rowText)
    ) {
      continue;
    }

    const category = littleCaesarsCategoryFromRow(row.items);

    if (category) {
      currentCategory = category;
      pendingName = null;
      continue;
    }

    if (
      ["Lunch Combo", "Meals & Lunch Combos", "Toppings"].includes(
        currentCategory,
      )
    ) {
      continue;
    }

    if (/^(Egg|Milk|Wheat|Soy|Sesame|Other)$/i.test(rowText)) {
      continue;
    }

    const name = cleanText(
      row.items
        .filter((item) => item.x < 215)
        .map((item) => item.str)
        .join(" "),
    );
    const hasNutrition = row.items.some(
      (item) => item.x >= 215 && item.x <= 490 && /^>?<?\d/.test(item.str),
    );
    const markers = row.items.filter(
      (item) => /^a$/i.test(item.str) && item.x >= 495,
    );

    if (!name && !hasNutrition && markers.length > 0) {
      pendingName = null;
      pendingMarkers = markers;
      continue;
    }

    if (name && isProbablyMenuItemName(name)) {
      pendingName = pendingName ? `${pendingName} ${name}` : name;
    }

    if (!hasNutrition && markers.length === 0 && pendingMarkers.length === 0) {
      continue;
    }

    const itemName = littleCaesarsQualifiedItemName(
      pendingName ?? name,
      currentCategory,
    );

    if (!itemName || !isProbablyMenuItemName(itemName)) {
      continue;
    }

    const allergens = [];

    for (const marker of markers.length > 0 ? markers : pendingMarkers) {
      const column = allergenColumns.find(
        (entry) => marker.x >= entry.min && marker.x <= entry.max,
      );

      if (column) {
        allergens.push(column.id);
      }
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        officialAllergenCoveredIds: littleCaesarsAllergenCoverage(),
        category: littleCaesarsCategoryForItem(itemName, currentCategory),
        description:
          "Official Little Caesars nutrition and allergen information PDF.",
        imageUrl: null,
        mayContain: [],
        name: itemName,
        nutritionFacts: nutritionFactsFromLittleCaesarsRow(row.items),
        sourceKind: "pdf-matrix",
        sourceUrl: url,
      }),
    );
    pendingName = null;
    pendingMarkers = [];
  }

  return records;
}

function nutritionFactsFromLittleCaesarsRow(items) {
  const valueAt = (targetX, tolerance = 13) =>
    cleanText(
      items.find((item) => Math.abs(item.x - targetX) <= tolerance)?.str,
    );

  return normalizeNutritionFacts({
    Calories: valueAt(226),
    "Calories from Fat": valueAt(252),
    "Total Fat": valueAt(280),
    "Saturated Fat": valueAt(304),
    "Trans Fat": valueAt(328),
    Cholesterol: valueAt(354),
    Sodium: valueAt(379),
    "Total Carbohydrates": valueAt(403),
    "Dietary Fiber": valueAt(428),
    Sugars: valueAt(457),
    Protein: valueAt(483),
  });
}

function littleCaesarsCategoryFromRow(items) {
  const text = cleanText(
    items.map((item) => item.str).join(" "),
  )?.toUpperCase();

  if (!text) {
    return null;
  }

  const categories = [
    [/^LARGE EXTRAMOSTBESTEST(?:®)? PIZZAS$/, "ExtraMostBestest Pizzas"],
    [/^LARGE SPECIALTY PIZZAS$/, "Specialty Pizzas"],
    [/^LARGE CLASSIC PIZZAS$/, "Classic Pizzas"],
    [/^DETROIT-STYLE DEEP DISH PIZZAS SPECIALTY$/, "Detroit-Style Deep Dish Specialty Pizzas"],
    [/^DETROIT-STYLE DEEP DISH PIZZAS$/, "Detroit-Style Deep Dish Pizzas"],
    [/^SIDES$/, "Sides"],
    [/^CAESAR WINGS(?:®)?$/, "Caesar Wings"],
    [/^CAESAR DIPS(?:®)?(?: \(SERVING SIZE: 1 CONTAINER\))?$/, "Caesar Dips"],
    [/^THIN CRUST PIZZAS$/, "Thin Crust Pizzas"],
    [/^MAKE IT STUFFED CRUST$/, "Crust Options"],
    [/^EXTRAS$/, "Extras"],
    [/^TOPPINGS\*?$/, "Toppings"],
    [/^CUSTOM ROUND PIZZAS\b.*ADD CALORIES TO BASE PIZZA$/, "Toppings"],
    [/^CUSTOM DETROIT-STYLE DEEP DISH\b.*ADD CALORIES TO BASE PIZZA$/, "Toppings"],
    [/^MEALS & LUNCH COMBOS$/, "Meals & Lunch Combos"],
    [/^LUNCH COMBO$/, "Lunch Combo"],
  ];

  return categories.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

export function littleCaesarsAllergenCoverage() {
  return ["egg", "milk", "soy", "wheat"];
}

function littleCaesarsQualifiedItemName(name, category) {
  let cleanedName = cleanText(name);

  if (!cleanedName) {
    return cleanedName;
  }

  if (/^Cookie Dough Brownie made with M&M[’']S$/i.test(cleanedName)) {
    cleanedName = "Cookie Dough Brownie made with M&M'S Minis Chocolate Candies (full package)";
  } else if (
    /^MINIS Chocolate Candies \(full package\) Cookie Dough Brownie made with TWIX$/i.test(
      cleanedName,
    )
  ) {
    cleanedName = "Cookie Dough Brownie made with TWIX Cookie Bar Pieces (full package)";
  }

  if (!/^(?:Pepperoni|Cheese|Italian Sausage|5 Meat Feast|Ultimate Supreme|3 Meat Treat|Hula Hawaiian|Veggie)$/i.test(cleanedName)) {
    return cleanedName;
  }

  const prefixByCategory = new Map([
    ["ExtraMostBestest Pizzas", "ExtraMostBestest"],
    ["Classic Pizzas", "Classic"],
    ["Detroit-Style Deep Dish Pizzas", "Detroit-Style Deep Dish"],
    ["Detroit-Style Deep Dish Specialty Pizzas", "Detroit-Style Deep Dish"],
    ["Thin Crust Pizzas", "Thin Crust"],
  ]);
  const prefix = prefixByCategory.get(category);

  return prefix ? `${prefix} ${cleanedName}` : cleanedName;
}

function littleCaesarsCategoryForItem(name, fallback) {
  if (
    fallback &&
    !["Menu", "Menu Options", "Pizza"].includes(fallback)
  ) {
    return fallback;
  }

  if (/sauce|ranch|butter garlic|cheddar cheese/i.test(name)) {
    return "Sauces";
  }

  if (
    /topping|extra cheese|pepperoni|bacon|sausage|beef|peppers|olives|mushrooms|onions/i.test(
      name,
    )
  ) {
    return fallback === "Toppings" ? "Toppings" : fallback;
  }

  if (
    /crazy bread|cheese bread|cookie|brownie|wings|packet|stuffed crust/i.test(
      name,
    )
  ) {
    return "Sides";
  }

  return fallback;
}

function zaxbysCategoryForItem(name, fallback) {
  if (/\bzalad\b/i.test(name)) {
    return "Zalads";
  }

  return fallback;
}

function zaxbysCategoryFromRow(values) {
  const text = cleanText(values.join(" "))?.replace(/®|™/g, "");
  const normalized = text?.toUpperCase();
  const categoryMap = new Map([
    ["SHRIMP", "Limited Time Offerings"],
    ["ZALADS", "Zalads"],
    ["SANDWICHES", "Sandwiches"],
    ["MOST POPULAR", "Most Popular"],
    ["1 BONELESS WING", "Boneless Wings"],
    ["5 BONELESS WINGS", "Boneless Wings"],
    ["10 BONELESS WINGS", "Boneless Wings"],
    ["1 TRADITIONAL WING", "Traditional Wings"],
    ["5 TRADITIONAL WINGS", "Traditional Wings"],
    ["10 TRADITIONAL WINGS", "Traditional Wings"],
    ["1 CHICKEN FINGER", "Chicken Fingerz"],
    ["5 CHICKEN FINGERZ", "Chicken Fingerz"],
    ["1 CHICKEN FINGER WITH EACH SAUCE", "Chicken Fingerz"],
    ["5 CHICKEN FINGERZ WITH EACH SAUCE", "Chicken Fingerz"],
    ["DESSERTS", "Treats"],
    ["TREATS", "Treats"],
    ["SAUCES", "Sauces"],
    ["DRESSINGS", "Dressings"],
    ["SIDES", "Sides"],
    ["KIDS", "Kids"],
    ["KIDS MEALS", "Kids"],
    ["PLATTERS & SIDES", "Catering"],
    ["CATERING", "Catering"],
    ["DRINKS", "Drinks"],
  ]);

  return normalized ? (categoryMap.get(normalized) ?? null) : null;
}

async function extractJackInTheBoxPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const allergenColumns = [
    { id: "soy", x: 284 },
    { id: "egg", x: 321 },
    { id: "fish", x: 355 },
    { id: "milk", x: 391 },
    { id: "peanut", x: 427 },
    { id: "shellfish", x: 462 },
    { id: "tree-nut", x: 498 },
    { id: "wheat", x: 533 },
  ];
  const categoryNames = new Set([
    "Better For You",
    "Burgers & More",
    "Chicken & Fish",
    "Something Different",
    "Salads",
    "Snacks & Sides",
    "Breakfast",
    "Drinks",
    "Shakes & Desserts",
    "Kid's Combos",
    "Ingredients",
  ]);
  const records = [];
  let currentCategory = restaurant.category;

  for (const row of rows) {
    const texts = row.items.map((item) => item.str);
    const joined = cleanText(texts.join(" "));

    if (!joined) {
      continue;
    }

    if (texts.includes("Allergens")) {
      const categoryText = cleanText(
        row.items
          .filter((item) => item.x < 220)
          .map((item) => item.str)
          .join(" "),
      );

      if (categoryText && !/^allergens$/i.test(categoryText)) {
        currentCategory = categoryText;
      }

      continue;
    }

    if (
      /^(Allergens Reference Guide|8 Major Food Allergens:|-- \d+ of \d+ --)$/i.test(
        joined,
      )
    ) {
      continue;
    }

    if (categoryNames.has(joined)) {
      currentCategory = joined;
      continue;
    }

    const name = cleanText(
      row.items
        .filter((item) => item.x < 220)
        .map((item) => item.str)
        .join(" "),
    );

    if (
      !name ||
      !isProbablyMenuItemName(name) ||
      /^\*|^\^|^Allergen Key$/i.test(name) ||
      /\b(?:may contain traces|manufactured on equipment|allergens listed below|allergens are present|contains naturally occurring)\b/i.test(
        name,
      )
    ) {
      continue;
    }

    const allergens = [];

    for (const marker of row.items.filter((item) => /^x$/i.test(item.str))) {
      const column = allergenColumns.find(
        (entry) => Math.abs(entry.x - marker.x) <= 8,
      );

      if (column) {
        allergens.push(column.id);
      }
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: "Official Jack in the Box allergens reference guide PDF.",
        imageUrl: null,
        mayContain: [],
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
      }),
    );
  }

  return records;
}

async function extractJackInTheBoxNutritionPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const records = [];
  let currentCategory = restaurant.category;

  for (const row of rows) {
    const parts = row.items.map((item) => cleanText(item.str)).filter(Boolean);
    const rowText = cleanText(parts.join(" ")) ?? "";
    const category = jackInTheBoxNutritionCategory(rowText);

    if (category) {
      currentCategory = category;
      continue;
    }

    const parsed = parseJackInTheBoxNutritionRow(parts);

    if (!parsed) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.unavailable,
        allergens: [],
        category: jackInTheBoxCategoryForNutritionItem(
          parsed.name,
          currentCategory,
        ),
        description: "Official Jack in the Box nutrition facts PDF.",
        imageUrl: null,
        mayContain: [],
        name: parsed.name,
        nutritionFacts: nutritionFactsFromJackInTheBoxValues(parsed.values),
        sourceKind: "pdf-nutrition",
        sourceUrl: url,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function jackInTheBoxNutritionCategory(rowText) {
  const normalized = cleanText(rowText)?.replace(/®|™/g, "");

  if (!normalized) {
    return null;
  }

  const categories = new Map([
    ["Burgers & More", "Burgers & More"],
    ["Chicken & More", "Chicken & More"],
    ["Salads", "Salads"],
    ["Something Different", "Something Different"],
    ["Snacks & Sides", "Snacks & Sides"],
    ["Breakfast", "Breakfast"],
    ["Drinks", "Drinks"],
    ["Shakes & Desserts", "Shakes & Desserts"],
    ["Kids", "Kids"],
    ["Ingredients", "Ingredients"],
    ["Jack Wraps", "Chicken & More"],
  ]);

  return categories.get(normalized) ?? null;
}

function parseJackInTheBoxNutritionRow(parts) {
  const values = [];

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (!isNutritionValueToken(parts[index])) {
      break;
    }

    values.unshift(parts[index]);
  }

  if (values.length < 13) {
    return null;
  }

  let prefix = parts.slice(0, parts.length - values.length);

  while (prefix.length > 0 && isJackInTheBoxAllergenCodeToken(prefix.at(-1))) {
    prefix = prefix.slice(0, -1);
  }

  const name = cleanJackInTheBoxNutritionName(prefix);

  if (
    !name ||
    !isProbablyMenuItemName(name) ||
    /^(?:Product|Serving|Calories|Total|Sodium|Potassium|Protein|Vitamin|Nutrition Facts)$/i.test(
      name,
    ) ||
    /\b(?:supplies|portioning|ingredient and nutrient information|serving size designation|salad dressing)\b/i.test(
      name,
    )
  ) {
    return null;
  }

  return { name, values: values.slice(0, 13) };
}

function isJackInTheBoxAllergenCodeToken(value) {
  const token = cleanText(value);

  if (!token) {
    return false;
  }

  return /^(?:[SEMWFCPN]+ss|[SEMWFCPN]+|ss)$/i.test(token);
}

function cleanJackInTheBoxNutritionName(parts) {
  let name = cleanText(parts.join(" "));

  if (!name) {
    return null;
  }

  name = name
    .replace(
      /\s+([®,™)])|([(])\s+/g,
      (_match, suffix, prefix) => suffix ?? prefix,
    )
    .replace(/\s*'\s*s\b/g, "'s")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+\.s\b/g, "'s")
    .replace(/\s+([.-])\s+/g, "$1 ")
    .replace(/\^|>/g, "")
    .replace(/\bC hocolate\b/gi, "Chocolate")
    .replace(/\bS ha k e\b/gi, "Shake")
    .replace(/\bW hipped\b/gi, "Whipped")
    .replace(/\bT opping\b/gi, "Topping")
    .replace(/\bOR E O\b/gi, "OREO")
    .replace(/\bS trawber r y\b/gi, "Strawberry")
    .replace(/\bV anilla\b/gi, "Vanilla")
    .replace(/\bC heese\b/gi, "Cheese")
    .replace(/\bC a k\b/gi, "Cake")
    .replace(/\bM ini C hur r os\b/gi, "Mini Churros")
    .replace(/\bN ew Y ork S tyle C heeseca k\b/gi, "New York Style Cheesecake")
    .replace(/\bR eal S wiss\b/gi, "Real Swiss")
    .replace(/\bS wiss S tyle\b/gi, "Swiss Style")
    .replace(/\bBerrry\b/gi, "Berry")
    .replace(/\ba al carte\b/gi, "a la carte")
    .replace(/\s+/g, " ")
    .trim();

  return name || null;
}

function jackInTheBoxCategoryForNutritionItem(name, fallback) {
  if (/breakfast|pancake|hash brown|burrito|sausage/i.test(name)) {
    return "Breakfast";
  }

  if (/shake|cake|churro|cheesecake|dessert/i.test(name)) {
    return "Shakes & Desserts";
  }

  if (/coffee|tea|juice|milk|red bull|drink/i.test(name)) {
    return "Drinks";
  }

  if (/fries|rings|egg roll|sauce|dip/i.test(name)) {
    return "Snacks & Sides";
  }

  if (/chicken|fish|wrap/i.test(name)) {
    return "Chicken & More";
  }

  if (/burger|jack|cheese/i.test(name)) {
    return "Burgers & More";
  }

  return fallback;
}

function nutritionFactsFromJackInTheBoxValues(values) {
  return normalizeNutritionFacts({
    "Serving Size": values[0],
    Calories: values[1],
    "Calories from Fat": values[2],
    "Total Fat": values[3],
    "Saturated Fat": values[4],
    "Trans Fat": values[5],
    Cholesterol: values[6],
    Sodium: values[7],
    Potassium: values[8],
    "Total Carbohydrates": values[9],
    "Dietary Fiber": values[10],
    Sugars: values[11],
    Protein: values[12],
  });
}

async function readPdfPositionRows(buffer) {
  const pdfjsLib = await getPdfJsLib();
  const document = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
  }).promise;
  const rows = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const byY = new Map();

    for (const item of content.items) {
      const str = cleanText(item.str);

      if (!str) {
        continue;
      }

      const x = Math.round(item.transform[4]);
      const y = Math.round(item.transform[5]);
      const key = `${pageNumber}:${y}`;
      const row = byY.get(key) ?? { items: [], pageNumber, y };
      row.items.push({ str, x });
      byY.set(key, row);
    }

    rows.push(
      ...Array.from(byY.values()).map((row) => ({
        ...row,
        items: row.items.sort((left, right) => left.x - right.x),
      })),
    );
  }

  return rows.sort((left, right) =>
    left.pageNumber === right.pageNumber
      ? right.y - left.y
      : left.pageNumber - right.pageNumber,
  );
}

async function readPdfVectorMarks(
  buffer,
  classifyMark = classifySonicVectorMark,
) {
  const pdfjsLib = await getPdfJsLib();
  const { OPS } = pdfjsLib;
  const document = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
  }).promise;
  const marks = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const operatorList = await page.getOperatorList();
      const state = {
        fillColor: null,
        matrix: [1, 0, 0, 1, 0, 0],
      };
      const stack = [];
      let pendingPath = null;

      for (let index = 0; index < operatorList.fnArray.length; index += 1) {
        const fn = operatorList.fnArray[index];
        const opArgs = operatorList.argsArray[index] ?? [];

        if (fn === OPS.save) {
          stack.push({ fillColor: state.fillColor, matrix: [...state.matrix] });
          continue;
        }

        if (fn === OPS.restore) {
          const restored = stack.pop();

          if (restored) {
            state.fillColor = restored.fillColor;
            state.matrix = restored.matrix;
          }
          continue;
        }

        if (fn === OPS.transform) {
          state.matrix = multiplyPdfMatrix(state.matrix, opArgs);
          continue;
        }

        if (fn === OPS.setFillRGBColor) {
          state.fillColor = pdfRgbToHex(opArgs);
          continue;
        }

        if (fn === OPS.setFillGray) {
          state.fillColor = pdfRgbToHex([opArgs[0], opArgs[0], opArgs[0]]);
          continue;
        }

        if (fn === OPS.constructPath) {
          pendingPath = pdfPathBoundingBox(opArgs, state.matrix);
          const immediateMark = classifyMark(pendingPath, state.fillColor);

          if (immediateMark) {
            marks.push({ ...immediateMark, pageNumber });
            pendingPath = null;
          }
          continue;
        }

        if (
          pendingPath &&
          [OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke].includes(fn)
        ) {
          const mark = classifyMark(pendingPath, state.fillColor);

          if (mark) {
            marks.push({ ...mark, pageNumber });
          }

          pendingPath = null;
          continue;
        }

        if (fn === OPS.endPath) {
          pendingPath = null;
        }
      }
    }
  } finally {
    await document.destroy();
  }

  return marks;
}

function classifySonicVectorMark(box, fillColor) {
  if (!box || box.x < 220 || box.x > 555 || box.y < 40 || box.y > 750) {
    return null;
  }

  if (
    isClosePdfColor(fillColor, "#ee3350") &&
    box.width >= 9 &&
    box.width <= 18 &&
    box.height >= 7 &&
    box.height <= 16
  ) {
    return {
      centerX: box.x + box.width / 2,
      centerY: box.y + box.height / 2,
      type: "contains",
    };
  }

  if (
    isClosePdfColor(fillColor, "#7c94b4") &&
    box.width >= 2 &&
    box.width <= 7 &&
    box.height >= 2 &&
    box.height <= 7
  ) {
    return {
      centerX: box.x + box.width / 2,
      centerY: box.y + box.height / 2,
      type: "may-contain",
    };
  }

  return null;
}

function pdfPathBoundingBox(pathArgs, matrix) {
  const explicitBox = flattenPdfPathCoords(pathArgs?.[2]);

  if (explicitBox.length >= 4) {
    const [minX, minY, maxX, maxY] = explicitBox;
    const points = [
      transformPdfPoint(matrix, minX, minY),
      transformPdfPoint(matrix, minX, maxY),
      transformPdfPoint(matrix, maxX, minY),
      transformPdfPoint(matrix, maxX, maxY),
    ];
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);

    return {
      height: Math.max(...ys) - Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      x: Math.min(...xs),
      y: Math.min(...ys),
    };
  }

  const coords = flattenPdfPathCoords(pathArgs?.[1]);

  if (coords.length < 2) {
    return null;
  }

  const points = [];

  for (let index = 0; index < coords.length - 1; index += 2) {
    const x = Number(coords[index]);
    const y = Number(coords[index + 1]);

    if (Number.isFinite(x) && Number.isFinite(y)) {
      points.push(transformPdfPoint(matrix, x, y));
    }
  }

  if (points.length === 0) {
    return null;
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    height: maxY - minY,
    width: maxX - minX,
    x: minX,
    y: minY,
  };
}

function flattenPdfPathCoords(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenPdfPathCoords(entry));
  }

  if (ArrayBuffer.isView(value)) {
    return Array.from(value);
  }

  if (typeof value === "object") {
    return Object.keys(value)
      .sort((left, right) => Number(left) - Number(right))
      .map((key) => value[key]);
  }

  return Number.isFinite(Number(value)) ? [Number(value)] : [];
}

function multiplyPdfMatrix(left, right) {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

function transformPdfPoint(matrix, x, y) {
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  };
}

function pdfRgbToHex(values) {
  if (typeof values[0] === "string" && values[0].startsWith("#")) {
    return values[0].toLowerCase();
  }

  const channels = values.slice(0, 3).map((value) => {
    const numeric = Number(value);
    const channel = numeric <= 1 ? numeric * 255 : numeric;
    return Math.max(0, Math.min(255, Math.round(channel)));
  });

  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function isClosePdfColor(actual, expected) {
  if (!actual) {
    return false;
  }

  const actualRgb = hexToRgb(actual);
  const expectedRgb = hexToRgb(expected);

  return actualRgb.every(
    (channel, index) => Math.abs(channel - expectedRgb[index]) <= 8,
  );
}

function hexToRgb(hex) {
  return [1, 3, 5].map((index) =>
    Number.parseInt(hex.slice(index, index + 2), 16),
  );
}

function extractInNOutPdfItems(text, restaurant, url) {
  if (!/MENU ITEMS THAT CONTAIN KNOWN COMMON ALLERGENS/i.test(text)) {
    return [];
  }

  const rows = [
    {
      name: "Buns - AZ/CA/ID/NV/OR/UT/WA",
      allergens: ["wheat"],
      mayContain: ["sesame", "soy"],
      variantGroup: "Buns",
    },
    {
      name: "Buns - CO/TN/TX",
      allergens: ["wheat", "sesame"],
      mayContain: ["milk"],
      variantGroup: "Buns",
    },
    { name: "Cheese", allergens: ["milk", "soy"], mayContain: [] },
    { name: "Spread", allergens: ["egg"], mayContain: [] },
    {
      name: "Milk Beverage",
      allergens: ["milk"],
      mayContain: [],
      variantGroup: "Milk",
    },
    {
      name: "Chocolate Shake",
      allergens: ["milk", "soy"],
      mayContain: ["egg"],
    },
    {
      name: "Strawberry Shake",
      allergens: ["milk"],
      mayContain: ["egg", "soy"],
    },
    {
      name: "Vanilla Shake",
      allergens: ["milk"],
      mayContain: ["egg", "soy"],
    },
    { name: "Half & Half Creamer", allergens: ["milk"], mayContain: [] },
    {
      name: "Oat Milk Creamer",
      allergens: [],
      mayContain: ["tree-nut", "milk"],
    },
    {
      name: "Hot Cocoa",
      allergens: ["milk", "soy"],
      mayContain: ["tree-nut", "egg", "wheat"],
    },
    {
      name: "Marshmallow Bits",
      allergens: [],
      mayContain: ["tree-nut", "peanut"],
    },
  ];

  return rows.map((row) =>
    createRecord({
      allergenSourceType: allergenSourceTypes.officialAllergenMenu,
      allergens: row.allergens,
      category: restaurant.category,
      description: "Official In-N-Out allergen information PDF.",
      imageUrl: null,
      mayContain: row.mayContain,
      name: row.name,
      sourceKind: "pdf-matrix",
      sourceUrl: url,
      variantGroup: row.variantGroup,
    }),
  );
}

function extractRaisingCanesPdfItems(text, restaurant, url) {
  const records = [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let currentCategory = restaurant.category;

  for (const line of lines) {
    const cleanLine = cleanText(line);

    if (!cleanLine) {
      continue;
    }

    if (
      /^(INDIVIDUAL ITEMS|COMBINATION MEALS|DRINKS|CONDIMENTS)/i.test(cleanLine)
    ) {
      currentCategory = titleCase(cleanLine.replace(/\s*\[.*$/, ""));
      continue;
    }

    const parts = line.split(/\t+/).map(cleanText).filter(Boolean);

    if (parts.length < 13) {
      continue;
    }

    const name = parts[0];
    const code = parts[parts.length - 1]?.replace(/\s+/g, "");

    if (
      !name ||
      !code ||
      !isProbablyMenuItemName(name) ||
      !/^(?:-|[ESFMNW*]+SS?[ESFMNW*]*)$/i.test(code)
    ) {
      continue;
    }

    const direct = raisingCanesAllergenCodes(code.replace("*", ""));
    const mayContain = code.includes("*") ? ["egg", "milk", "wheat"] : [];

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens: direct,
        category: currentCategory,
        description:
          "Official Raising Cane's nutritional and allergen information PDF.",
        imageUrl: null,
        mayContain,
        name,
        nutritionFacts: nutritionFactsFromRaisingCanesParts(parts),
        sourceKind: "pdf-matrix",
        sourceUrl: url,
      }),
    );
  }

  return records;
}

function nutritionFactsFromRaisingCanesParts(parts) {
  return normalizeNutritionFacts({
    "Serving Size": parts[1],
    Calories: parts[2],
    "Total Fat": parts[3],
    "Saturated Fat": parts[4],
    "Trans Fat": parts[5],
    Cholesterol: parts[6],
    Sodium: parts[7],
    "Total Carbohydrates": parts[8],
    "Dietary Fiber": parts[9],
    Sugars: parts[10],
    Protein: parts[11],
  });
}

function raisingCanesAllergenCodes(code) {
  const allergens = [];
  let remaining = code.toUpperCase();

  if (remaining.includes("SS")) {
    allergens.push("sesame");
    remaining = remaining.replaceAll("SS", "");
  }

  for (const letter of remaining) {
    if (letter === "E") allergens.push("egg");
    if (letter === "S") allergens.push("soy");
    if (letter === "F") allergens.push("fish");
    if (letter === "M") allergens.push("milk");
    if (letter === "N") allergens.push("tree-nut");
    if (letter === "W") allergens.push("wheat");
  }

  return uniqueStrings(allergens);
}

async function extractOliveGardenAllergenPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const records = [];
  let currentCategory = null;

  for (const row of rows) {
    const rowText =
      cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const leftText = cleanFirstWatchPdfName(
      row.items
        .filter((item) => item.x < 215)
        .map((item) => item.str)
        .join(" "),
    );

    if (!leftText) {
      continue;
    }

    if (/^[A-Z][A-Z\s,&]+:$/.test(leftText)) {
      currentCategory = titleCase(leftText.replace(/:$/, ""));
      continue;
    }

    if (
      !currentCategory ||
      !isProbablyMenuItemName(leftText) ||
      isOliveGardenPdfNonItem(rowText)
    ) {
      continue;
    }

    const allergens = [];
    const mayContain = [];
    const hasCrossContactMarker = row.items.some(
      (item) => item.x >= 215 && item.x < 275 && /[●]/.test(item.str),
    );

    for (const item of row.items) {
      if (!/^Y$/i.test(item.str)) {
        continue;
      }

      const allergen = closestOliveGardenAllergenColumn(item.x);

      if (allergen) {
        allergens.push(allergen);
      }
    }

    if (hasCrossContactMarker) {
      mayContain.push(
        "milk",
        "egg",
        "fish",
        "shellfish",
        "tree-nut",
        "peanut",
        "wheat",
        "gluten",
        "soy",
        "sesame",
      );
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: "Official Olive Garden allergen information PDF.",
        imageUrl: null,
        mayContain,
        name: leftText,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return records;
}

function isOliveGardenPdfNonItem(text) {
  return (
    /^(?:KEY TO THIS GUIDE|PREPARATION|COMMON ALLERGENS|THE INFORMATION BELOW|BEFORE PLACING|Page \d+|US_\d+)/i.test(
      text,
    ) ||
    /^\(|^● Menu item presents|\ballergens due to the cooking method\b/i.test(
      text,
    )
  );
}

function closestOliveGardenAllergenColumn(x) {
  const columns = [
    { allergen: "milk", x: 289 },
    { allergen: "egg", x: 331 },
    { allergen: "fish", x: 371 },
    { allergen: "shellfish", x: 403 },
    { allergen: "shellfish", x: 447 },
    { allergen: "tree-nut", x: 487 },
    { allergen: "peanut", x: 530 },
    { allergen: "wheat", x: 573 },
    { allergen: "gluten", x: 615 },
    { allergen: "soy", x: 662 },
    { allergen: "sesame", x: 698 },
  ];
  const closest = columns
    .map((column) => ({ ...column, distance: Math.abs(column.x - x) }))
    .sort((left, right) => left.distance - right.distance)[0];

  return closest?.distance <= 18 ? closest.allergen : null;
}

async function extractLongHornAllergenPdfItems(buffer, restaurant, url) {
  const pdfjsLib = await getPdfJsLib();
  const document = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
  }).promise;
  const records = [];
  let currentCategory = null;

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const clusters = [];

    for (const item of content.items) {
      const str = cleanText(item.str);

      if (!str) {
        continue;
      }

      const x = Math.round(item.transform[4]);
      const y = Math.round(item.transform[5]);

      if (x < 245 || x > 760) {
        continue;
      }

      let cluster = clusters.find(
        (candidate) => Math.abs(candidate.x - x) <= 2,
      );

      if (!cluster) {
        cluster = { x, items: [] };
        clusters.push(cluster);
      }

      cluster.items.push({ str, x, y });
    }

    for (const cluster of clusters.sort((left, right) => left.x - right.x)) {
      const name = cleanLongHornPdfName(
        cluster.items
          .filter((item) => item.y < 245)
          .sort((left, right) => left.y - right.y)
          .map((item) => item.str)
          .join(" "),
      );
      const markerItems = cluster.items.filter(
        (item) => item.y >= 330 && /^(?:Y|M|[●])$/i.test(item.str),
      );

      if (!name) {
        continue;
      }

      if (isLongHornPdfCategory(name, markerItems)) {
        currentCategory = titleCase(name).replace(/'S\b/g, "'s");
        continue;
      }

      if (
        !currentCategory ||
        !isProbablyMenuItemName(name) ||
        isLongHornPdfNonItem(name)
      ) {
        continue;
      }

      const allergens = [];
      const mayContain = [];
      let isConfigurable = false;
      const hasPrepCrossContactMarker = markerItems.some(
        (item) => /[●]/.test(item.str) && closestLongHornPrepColumn(item.y),
      );

      for (const item of markerItems) {
        if (/^Y$/i.test(item.str)) {
          const allergen = closestLongHornAllergenColumn(item.y);

          if (allergen) {
            allergens.push(allergen);
          }
        }

        if (
          /^M$/i.test(item.str) &&
          closestLongHornAllergenColumn(item.y) === "gluten"
        ) {
          allergens.push("gluten");
          isConfigurable = true;
        }
      }

      if (hasPrepCrossContactMarker) {
        mayContain.push(
          "milk",
          "egg",
          "fish",
          "shellfish",
          "tree-nut",
          "peanut",
          "wheat",
          "gluten",
          "soy",
          "sesame",
        );
      }

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens,
          category: currentCategory,
          description: "Official LongHorn Steakhouse allergen information PDF.",
          evidenceText:
            mayContain.length > 0
              ? "Official LongHorn Steakhouse allergen guide row parsed; preparation marker indicates cross-contact risk."
              : "Official LongHorn Steakhouse allergen information PDF.",
          imageUrl: null,
          isConfigurable,
          mayContain,
          name,
          sourceKind: "pdf-matrix",
          sourceUrl: url,
          variantGroup: currentCategory,
        }),
      );
    }
  }

  return records;
}

function cleanLongHornPdfName(value) {
  return cleanText(
    value
      ?.replace(/[‐‑‒–—]/g, "-")
      .replace(/\s+\+/g, " +")
      .replace(/\+\s+/g, "+ ")
      .replace(/\s+/g, " "),
  );
}

function isLongHornPdfCategory(name, markerItems) {
  return (
    markerItems.length === 0 &&
    /^[A-Z][A-Z\s,&']+$/.test(name) &&
    name.length >= 4
  );
}

function isLongHornPdfNonItem(name) {
  return /^(?:GRILLED|FRIED|SOYBEAN|PEANUT|TREE|SOY|EGG|DAIRY|WHEAT|FINFISH|MOLLUSCAN|CRUSTACEAN|SHELLFISH|GLUTEN|CONTAINS|INGREDIENTS|ASK FOR|INFORMATION VALID|LONGHORN STEAKHOUSE|COMMON ALLERGENS|PAGE \d+)/i.test(
    name,
  );
}

function closestLongHornAllergenColumn(y) {
  const columns = [
    { allergen: "peanut", y: 449 },
    { allergen: "tree-nut", y: 469 },
    { allergen: "soy", y: 488 },
    { allergen: "egg", y: 508 },
    { allergen: "milk", y: 528 },
    { allergen: "wheat", y: 548 },
    { allergen: "fish", y: 568 },
    { allergen: "shellfish", y: 604 },
    { allergen: "shellfish", y: 653 },
    { allergen: "gluten", y: 711 },
  ];
  const closest = columns
    .map((column) => ({ ...column, distance: Math.abs(column.y - y) }))
    .sort((left, right) => left.distance - right.distance)[0];

  return closest?.distance <= 17 ? closest.allergen : null;
}

function closestLongHornPrepColumn(y) {
  const columns = [365, 408];
  const closest = columns
    .map((columnY) => ({ columnY, distance: Math.abs(columnY - y) }))
    .sort((left, right) => left.distance - right.distance)[0];

  return closest?.distance <= 14 ? closest.columnY : null;
}

async function extractOutbackAllergenPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const records = [];
  let currentCategory = null;

  for (const row of rows) {
    const nameItems = row.items.filter((item) => item.x >= 90 && item.x < 292);
    const name = cleanText(nameItems.map((item) => item.str).join(" "));

    if (!name || isOutbackPdfNonItem(name)) {
      continue;
    }

    const markerItems = row.items.filter((item) => /^Y$/i.test(item.str));

    const minNameX = Math.min(...nameItems.map((item) => item.x));

    if (markerItems.length === 0 && minNameX <= 100) {
      currentCategory = titleCase(name);
      continue;
    }

    if (!currentCategory || !isProbablyMenuItemName(name)) {
      continue;
    }

    const allergens = markerItems
      .map((item) => closestOutbackAllergenColumn(item.x))
      .filter(Boolean);

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: "Official Outback Steakhouse allergen information PDF.",
        imageUrl: null,
        mayContain: [],
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return records;
}

function isOutbackPdfNonItem(name) {
  return /^(?:Outback Steakhouse|Y =|Menu Item Name|Eggs|Fish|Milk|Peanuts|Sesame|Shellfish|Soybean|Treenuts|Wheat|Created:|Due to|Soybean oil|This information|Though efforts|Please ask|made to order|Deep fried)/i.test(
    name,
  );
}

function closestOutbackAllergenColumn(x) {
  const columns = [
    { allergen: "egg", x: 294 },
    { allergen: "fish", x: 319 },
    { allergen: "milk", x: 343 },
    { allergen: "peanut", x: 369 },
    { allergen: "sesame", x: 393 },
    { allergen: "shellfish", x: 420 },
    { allergen: "soy", x: 448 },
    { allergen: "tree-nut", x: 476 },
    { allergen: "wheat", x: 503 },
  ];
  const closest = columns
    .map((column) => ({ ...column, distance: Math.abs(column.x - x) }))
    .sort((left, right) => left.distance - right.distance)[0];

  return closest?.distance <= 15 ? closest.allergen : null;
}

async function extractFirstWatchAllergenPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const allergenHeaderYByPage = new Map(
    rows
      .filter((row) => {
        const text = row.items.map((item) => item.str).join(" ");
        return (
          /\bEgg\b/i.test(text) &&
          /\bFish\b/i.test(text) &&
          /\bMustard\b/i.test(text)
        );
      })
      .map((row) => [row.pageNumber, row.y]),
  );
  const records = [];
  let currentCategory = "Allergen Guide";

  for (const row of rows) {
    const headerY = allergenHeaderYByPage.get(row.pageNumber);

    if (!headerY || row.y >= headerY) {
      continue;
    }

    const rowText =
      cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const leftText = cleanFirstWatchPdfName(
      row.items
        .filter((item) => item.x < 215)
        .map((item) => item.str)
        .join(" "),
    );

    if (!leftText) {
      continue;
    }

    if (
      /^\d{4}\s+.+MENU$/i.test(rowText) ||
      /^(?:2026\s+)?(?:SUMMER|FALL|WINTER|SPRING)/i.test(rowText)
    ) {
      currentCategory = titleCase(
        rowText.replace(/^2026\s+/i, "").replace(/\s+MENU$/i, " Menu"),
      );
      continue;
    }

    if (!isFirstWatchPdfItemName(leftText, rowText)) {
      continue;
    }

    const allergens = [];

    for (const item of row.items) {
      if (!/^X$/i.test(item.str)) {
        continue;
      }

      const allergen = closestFirstWatchAllergenColumn(item.x);

      if (allergen) {
        allergens.push(allergen);
      }
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: "Official First Watch allergen guide PDF.",
        imageUrl: null,
        mayContain: [],
        name: leftText,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return records;
}

function isFirstWatchPdfItemName(name, rowText) {
  if (!isProbablyMenuItemName(name)) {
    return false;
  }

  if (
    /\d{2,}\s+\d+\s+\d+/.test(rowText) ||
    /\b(?:Calories|Protein|Sodium|Carbohydrate)\b/i.test(rowText)
  ) {
    return false;
  }

  return !/^(?:Menu Item|Egg|Fish|Milk|Peanuts|Sesame|Shellfish|Soy|Tree Nuts|Wheat|Celery|Gluten|Mustard|The allergens|Please inform|This information|Note we|FIRST WATCH|CONFIDENTIAL|JUNE|R\d|To access|ALLERGEN GUIDE|A L L ERGEN GUIDE|BOOZY|& Allergen QR Code)/i.test(
    rowText,
  );
}

function cleanFirstWatchPdfName(value) {
  return cleanText(value)
    ?.replace(/(?:\s+X)+$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function closestFirstWatchAllergenColumn(x) {
  const columns = [
    { allergen: "egg", x: 230 },
    { allergen: "fish", x: 262 },
    { allergen: "milk", x: 293 },
    { allergen: "peanut", x: 325 },
    { allergen: "sesame", x: 357 },
    { allergen: "shellfish", x: 388 },
    { allergen: "soy", x: 420 },
    { allergen: "tree-nut", x: 452 },
    { allergen: "wheat", x: 483 },
    { allergen: "gluten", x: 546 },
  ];
  const closest = columns
    .map((column) => ({ ...column, distance: Math.abs(column.x - x) }))
    .sort((left, right) => left.distance - right.distance)[0];

  return closest?.distance <= 16 ? closest.allergen : null;
}

async function extractCrackerBarrelAllergenPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const records = [];
  let currentCategory = restaurant.category;

  for (const row of rows) {
    if (row.pageNumber < 4) {
      continue;
    }

    const rowText =
      cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const name = cleanCrackerBarrelPdfName(
      row.items
        .filter((item) => item.x < 365)
        .map((item) => item.str)
        .join(" "),
    );

    if (!name || isCrackerBarrelPdfNoise(rowText, name)) {
      continue;
    }

    if (crackerBarrelCategoryNames().has(name)) {
      currentCategory = name;
      continue;
    }

    if (!isProbablyMenuItemName(name)) {
      continue;
    }

    const allergens = [];
    const mayContain = [];

    for (const item of row.items) {
      if (!/^X$/i.test(item.str)) {
        continue;
      }

      const allergen = closestCrackerBarrelAllergenColumn(item.x);

      if (allergen) {
        allergens.push(allergen);
      }
    }

    const hasPrepCrossContact = row.items.some(
      (item) => /^Y$/i.test(item.str) && item.x >= 390 && item.x <= 470,
    );

    if (hasPrepCrossContact) {
      mayContain.push(
        "egg",
        "fish",
        "milk",
        "peanut",
        "sesame",
        "shellfish",
        "soy",
        "tree-nut",
        "wheat",
        "gluten",
      );
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: "Official Cracker Barrel allergen guide PDF.",
        imageUrl: null,
        mayContain,
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function cleanCrackerBarrelPdfName(value) {
  return cleanText(value)
    ?.replace(/^\*\s*/, "")
    .replace(/\s+\*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isCrackerBarrelPdfNoise(rowText, name) {
  return (
    /^(?:Y - potential risk|X - Menu item|Our normal kitchen|Page \d+|\d+)$/i.test(
      rowText,
    ) ||
    /^(?:Breakfast Menu|Lunch\/Dinner Menu|Preparation|Common Allergies)$/i.test(
      name,
    ) ||
    /^\*?with\s*$/i.test(name) ||
    /^Choice of Three Sauces:/i.test(name)
  );
}

function crackerBarrelCategoryNames() {
  return new Set([
    "All-Day Breakfast Meals",
    "Meat Biscuits",
    "Eggs n' Meat",
    "Griddle Classics",
    "Sweet Toppings",
    "Breakfast Extras",
    "Lunch and Dinner Meals",
    "Catering Sides",
    "Bread Choice",
    "Country Sides",
    "Premium Sides",
    "Salad Dressings",
    "Sauces",
    "Crispy Tender Dippers Platter",
    "Barrel Cheeseburger Slider Platter",
    "Build Your Own Chicken Sandwich Bar",
    "Iced Tea n' Beverages",
    "Desserts",
  ]);
}

function closestCrackerBarrelAllergenColumn(x) {
  const columns = [
    { allergen: "egg", x: 487 },
    { allergen: "fish", x: 508 },
    { allergen: "milk", x: 529 },
    { allergen: "peanut", x: 550 },
    { allergen: "sesame", x: 585 },
    { allergen: "shellfish", x: 610 },
    { allergen: "soy", x: 645 },
    { allergen: "tree-nut", x: 674 },
    { allergen: "wheat", x: 709 },
    { allergen: "gluten", x: 737 },
  ];
  const closest = columns
    .map((column) => ({ ...column, distance: Math.abs(column.x - x) }))
    .sort((left, right) => left.distance - right.distance)[0];

  return closest?.distance <= 16 ? closest.allergen : null;
}

async function extractBuffaloWildWingsAllergenPdfItems(
  buffer,
  restaurant,
  url,
) {
  const rows = await readPdfPositionRows(buffer);
  const records = [];
  let currentCategory = restaurant.category;

  for (const row of rows) {
    if (row.pageNumber >= 8) {
      continue;
    }

    const rowText =
      cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const leftItems = row.items.filter((item) => item.x < 170);
    const firstLeftText = cleanBuffaloWildWingsPdfName(leftItems[0]?.str);
    const name = cleanBuffaloWildWingsPdfName(
      leftItems.map((item) => item.str).join(" "),
    );

    if (!name || isBuffaloWildWingsPdfNoise(rowText, name)) {
      continue;
    }

    if (firstLeftText && isBuffaloWildWingsPdfCategory(firstLeftText)) {
      currentCategory = titleCase(firstLeftText);
      continue;
    }

    if (!isProbablyMenuItemName(name)) {
      continue;
    }

    const explicitMayContain = row.items
      .filter((item) => /may contain/i.test(item.str))
      .map((item) => closestBuffaloWildWingsAllergenColumn(item.x))
      .filter(Boolean);
    const hasFriedPrepMarker = row.items.some(
      (item) => /^X$/i.test(item.str) && item.x < 220,
    );
    const mayContain = uniqueStrings(
      explicitMayContain.length > 0 || hasFriedPrepMarker
        ? [
            ...explicitMayContain,
            ...(hasFriedPrepMarker ? majorAllergensForCrossContact() : []),
          ]
        : majorAllergensForCrossContact(),
    );

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens: [],
        category: currentCategory,
        description:
          "Buffalo Wild Wings menu item from the official allergen guide.",
        evidenceText:
          "Official BWW allergen guide row parsed; direct marker glyphs are not text-extractable, so cross-contact review is retained.",
        imageUrl: null,
        mayContain,
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function cleanBuffaloWildWingsPdfName(value) {
  return cleanText(value)
    ?.replace(/\s+-\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isBuffaloWildWingsPdfNoise(rowText, name) {
  return (
    /^(?:BUFFALO WILD WINGS|ALLERGEN & PREPARATION GUIDE|VALID|KEY:|PREPARATION|COMMON ALLERGENS|= Contains|Risk of cross-contamination|for all allergens|cooking method|FRIED|EGG|FISH|MILK|PEANUTS|SESAME|SHELLFISH|SOY|TREE NUTS|WHEAT|GLUTEN|©2026|PAGE \d+)/i.test(
      rowText,
    ) ||
    /^(?:= Risk of cross-contamination|see Signature Sauces|at select locations|limited time|All dippers are listed|All sandwiches|All burgers|Protein substitutions|Choice of \d|Add Chili|Add Chicken|Add Guacamole|with orzo rice)$/i.test(
      name,
    )
  );
}

function isBuffaloWildWingsPdfCategory(name) {
  return /^[A-Z0-9][A-Z0-9\s,&'-]+$/.test(name) && name.length >= 4;
}

function closestBuffaloWildWingsAllergenColumn(x) {
  const columns = [
    { allergen: "egg", x: 229 },
    { allergen: "fish", x: 264 },
    { allergen: "milk", x: 300 },
    { allergen: "peanut", x: 330 },
    { allergen: "sesame", x: 368 },
    { allergen: "shellfish", x: 401 },
    { allergen: "soy", x: 444 },
    { allergen: "tree-nut", x: 472 },
    { allergen: "wheat", x: 513 },
    { allergen: "gluten", x: 548 },
  ];
  const closest = columns
    .map((column) => ({ ...column, distance: Math.abs(column.x - x) }))
    .sort((left, right) => left.distance - right.distance)[0];

  return closest?.distance <= 28 ? closest.allergen : null;
}

async function extractRedLobsterAllergenPdfItems(buffer, restaurant, url) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 7);
  const records = [];
  let currentCategory = restaurant.category;

  for (const row of rows) {
    const rowText =
      cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const name = cleanRedLobsterPdfName(
      row.items
        .filter((item) => item.x < 390)
        .map((item) => item.str)
        .join(" "),
    );

    if (!name || isRedLobsterPdfNoise(rowText, name)) {
      continue;
    }

    const yesItems = row.items.filter((item) => /^Yes$/i.test(item.str));
    const naItems = row.items.filter((item) => /^#N\/A$/i.test(item.str));
    const prepRiskItems = row.items.filter(
      (item) => /^[l•●]$/i.test(item.str) && item.x >= 390,
    );

    if (
      yesItems.length === 0 &&
      prepRiskItems.length === 0 &&
      naItems.length >= 5
    ) {
      currentCategory = titleCase(name);
      continue;
    }

    if (!isProbablyMenuItemName(name)) {
      continue;
    }

    const allergens = yesItems
      .map((item) => closestRedLobsterAllergenColumn(item.x))
      .filter(Boolean);
    const mayContain =
      prepRiskItems.length > 0 ? majorAllergensForCrossContact() : [];

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: "Official Red Lobster allergen guide PDF.",
        evidenceText:
          mayContain.length > 0
            ? "Official Red Lobster allergen guide row parsed; preparation marker indicates cross-contact risk."
            : "Official Red Lobster allergen guide PDF.",
        imageUrl: null,
        mayContain,
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function cleanRedLobsterPdfName(value) {
  return cleanText(value)
    ?.replace(/\s+\*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isRedLobsterPdfNoise(rowText, name) {
  return (
    /^(?:Key to this Guide|PREPARATION|COMMON ALLERGENS|OTHER|Yes =|Blank =|•=|\*=|Risk of possible|Peanut|Tree Nut|Soy|Egg|Dairy|Wheat|Finfish|Molluscan|Crustacean|Gluten|Sulfites|ALLERGEN GUIDE|US RESTAURANTS|Information Valid|Because of|Soy Allergies|Unless noted|Page \d+|US Version)$/i.test(
      rowText,
    ) ||
    /^(?:\*=Regional Item|•= Menu item|\d+\.\s*(?:CHOOSE|ADD ON)|with orzo rice|Blank\s*=\s*Specific allergen|of all allergens due to the cooking method|onions\s*\)|Key to this Guide)$/i.test(
      name,
    )
  );
}

function closestRedLobsterAllergenColumn(x) {
  const columns = [
    { allergen: "peanut", x: 507 },
    { allergen: "tree-nut", x: 565 },
    { allergen: "soy", x: 626 },
    { allergen: "egg", x: 684 },
    { allergen: "milk", x: 742 },
    { allergen: "wheat", x: 800 },
    { allergen: "fish", x: 857 },
    { allergen: "shellfish", x: 922 },
    { allergen: "shellfish", x: 993 },
    { allergen: "gluten", x: 1064 },
  ];
  const closest = columns
    .map((column) => ({ ...column, distance: Math.abs(column.x - x) }))
    .sort((left, right) => left.distance - right.distance)[0];

  return closest?.distance <= 23 ? closest.allergen : null;
}

async function extractRedLobsterNutritionPdfItems(buffer, restaurant, url) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 4);
  const records = [];
  let currentCategory = restaurant.category;
  let pendingPrefix = null;

  for (const row of rows) {
    const rowText =
      cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const name = cleanRedLobsterPdfName(
      row.items
        .filter((item) => item.x < 285)
        .map((item) => item.str)
        .join(" "),
    );
    const nutritionFacts = nutritionFactsFromRedLobsterRow(row.items);

    if (!rowText || isRedLobsterNutritionNoise(rowText)) {
      continue;
    }

    if (name && Object.keys(nutritionFacts ?? {}).length === 0) {
      if (/^[A-Z][A-Z0-9®&'’\s-]+$/.test(name)) {
        currentCategory = titleCase(name.replace(/®/g, ""));
        pendingPrefix = null;
      } else if (isProbablyMenuItemName(name)) {
        pendingPrefix = name;
      }
      continue;
    }

    if (!name || !nutritionFacts || Object.keys(nutritionFacts).length === 0) {
      continue;
    }

    const itemName = pendingPrefix ? `${pendingPrefix} ${name}` : name;

    if (!isProbablyMenuItemName(itemName)) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.unavailable,
        allergens: [],
        category: currentCategory,
        description: "Official Red Lobster nutrition guide PDF.",
        imageUrl: null,
        mayContain: [],
        name: itemName,
        nutritionFacts,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );

    pendingPrefix = null;
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function nutritionFactsFromRedLobsterRow(items) {
  const valueAt = (targetX, tolerance = 14) =>
    cleanText(
      items.find((item) => Math.abs(item.x - targetX) <= tolerance)?.str,
    );

  return normalizeNutritionFacts({
    Calories: valueAt(296),
    "Calories from Fat": valueAt(342),
    "Total Fat": valueAt(384),
    "Saturated Fat": valueAt(425),
    "Trans Fat": valueAt(466),
    Cholesterol: valueAt(511),
    Sodium: valueAt(557),
    "Total Carbohydrates": valueAt(599),
    "Dietary Fiber": valueAt(636),
    Sugars: valueAt(670),
    Protein: valueAt(704),
  });
}

function isRedLobsterNutritionNoise(rowText) {
  return /^(?:Due to the handcrafted|Supplemental nutritional|If you have|Information Valid|Nutritional content|condiments and dipping|which are listed|Calories|from Fat|Total Fat|Sat\. Fat|Trans\. Fat|Cholesterol|Sodium|Carb|Fiber|Sugar|Protein|Page \d+|©)/i.test(
    rowText,
  );
}

function majorAllergensForCrossContact() {
  return [
    "egg",
    "fish",
    "milk",
    "peanut",
    "sesame",
    "shellfish",
    "soy",
    "tree-nut",
    "wheat",
    "gluten",
  ];
}

function clusterPdfRowsByPageAndY(rows, tolerance) {
  const clustered = [];
  const rowsByPage = new Map();

  for (const row of rows) {
    rowsByPage.set(row.pageNumber, [
      ...(rowsByPage.get(row.pageNumber) ?? []),
      row,
    ]);
  }

  for (const [pageNumber, pageRows] of rowsByPage) {
    const clusters = [];

    for (const row of pageRows.sort((left, right) => right.y - left.y)) {
      let cluster = clusters.find(
        (candidate) => Math.abs(candidate.y - row.y) <= tolerance,
      );

      if (!cluster) {
        cluster = { items: [], pageNumber, y: row.y };
        clusters.push(cluster);
      }

      cluster.items.push(...row.items);
      cluster.y = Math.round((cluster.y + row.y) / 2);
    }

    for (const cluster of clusters) {
      cluster.items.sort((left, right) => left.x - right.x);
      clustered.push(cluster);
    }
  }

  return clustered;
}

function extractWaffleHouseNutritionPdfItems(text, restaurant, url) {
  const records = [];
  const lines = text.split(/\r?\n/).map(cleanText).filter(Boolean);
  let currentCategory = restaurant.category;

  for (const line of lines) {
    if (
      /^[A-Z][A-Z\s&'™-]{4,}$/.test(line) &&
      !/\b(?:ALLERGENS|UPDATED|NAME)\b/i.test(line)
    ) {
      currentCategory = titleCase(line);
      continue;
    }

    const match = line.match(
      /^(.+?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)(?:\s+([A-Za-z, .]+))?$/,
    );

    if (!match) {
      continue;
    }

    const name = cleanWaffleHousePdfName(match[1]);
    const allergenText = cleanText(match[12] ?? "") ?? "";

    if (!name || !isProbablyMenuItemName(name) || /^Includes:$/i.test(name)) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens: waffleHouseAllergens(allergenText),
        category: currentCategory,
        description: "Official Waffle House nutrition and allergen PDF.",
        imageUrl: null,
        mayContain: [],
        name,
        nutritionFacts: nutritionFactsFromOrderedValues(match.slice(2, 12)),
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return records;
}

function cleanWaffleHousePdfName(value) {
  return cleanText(value)
    ?.replace(/^Includes:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function waffleHouseAllergens(value) {
  const allergenText = String(value).replace(/\.$/, "");
  const allergenMap = new Map([
    ["egg", "egg"],
    ["eggs", "egg"],
    ["milk", "milk"],
    ["peanut", "peanut"],
    ["peanuts", "peanut"],
    ["soy", "soy"],
    ["tree nuts", "tree-nut"],
    ["tree nut", "tree-nut"],
    ["wheat", "wheat"],
  ]);

  return uniqueStrings(
    allergenText
      .split(/,\s*/)
      .map((part) => allergenMap.get(part.trim().toLowerCase()))
      .filter(Boolean),
  );
}

async function extractDennysAllergenPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const records = [];
  const categories = ["Menu", "Menu", "Menu"];
  const clusters = [
    {
      nameEndX: 90,
      startX: 0,
      columns: [
        { allergen: "egg", x: 97 },
        { allergen: "fish", x: 119 },
        { allergen: "shellfish", x: 138 },
        { allergen: "milk", x: 163 },
        { allergen: "soy", x: 189 },
        { allergen: "peanut", x: 215 },
        { allergen: "tree-nut", x: 239 },
        { allergen: "wheat", x: 266 },
        { allergen: "gluten", x: 288 },
        { allergen: "sesame", x: 309 },
      ],
    },
    {
      nameEndX: 430,
      startX: 340,
      columns: [
        { allergen: "egg", x: 434 },
        { allergen: "fish", x: 456 },
        { allergen: "shellfish", x: 476 },
        { allergen: "milk", x: 500 },
        { allergen: "soy", x: 527 },
        { allergen: "peanut", x: 553 },
        { allergen: "tree-nut", x: 577 },
        { allergen: "wheat", x: 604 },
        { allergen: "gluten", x: 626 },
        { allergen: "sesame", x: 647 },
      ],
    },
    {
      nameEndX: 765,
      startX: 680,
      columns: [
        { allergen: "egg", x: 770 },
        { allergen: "fish", x: 792 },
        { allergen: "shellfish", x: 812 },
        { allergen: "milk", x: 836 },
        { allergen: "soy", x: 862 },
        { allergen: "peanut", x: 889 },
        { allergen: "tree-nut", x: 913 },
        { allergen: "wheat", x: 940 },
        { allergen: "gluten", x: 962 },
        { allergen: "sesame", x: 983 },
      ],
    },
  ];

  for (const row of rows) {
    const rowText =
      cleanText(row.items.map((item) => item.str).join(" ")) ?? "";

    if (
      /^(?:ALLERGENS|X - Contains|◊ - May contain|To designate|PLEASE NOTE|At Denny)/i.test(
        rowText,
      )
    ) {
      continue;
    }

    clusters.forEach((cluster, clusterIndex) => {
      const clusterItems = row.items.filter(
        (item) =>
          item.x >= cluster.startX &&
          item.x < (clusters[clusterIndex + 1]?.startX ?? 1100),
      );
      let name = cleanDennysPdfName(
        clusterItems
          .filter((item) => item.x < cluster.nameEndX)
          .map((item) => item.str)
          .join(" "),
      );

      if (!name) {
        return;
      }

      if (/^[A-Za-z][A-Za-z &/'-]+:$/.test(name)) {
        categories[clusterIndex] = titleCase(name.replace(/:$/, ""));
        return;
      }

      const prefixedName = name.match(
        /^([A-Za-z][A-Za-z &/'-]{2,30}):\s+(.+)$/,
      );

      if (prefixedName) {
        categories[clusterIndex] = titleCase(prefixedName[1]);
        name = cleanDennysPdfName(prefixedName[2]);
      }

      if (!isDennysPdfItemName(name)) {
        return;
      }

      const allergens = [];
      const mayContain = [];

      for (const item of clusterItems) {
        if (!/^(?:X|◊|A|F|SM|CO)$/i.test(item.str)) {
          continue;
        }

        const allergen = closestDennysAllergenColumn(item.x, cluster.columns);

        if (!allergen) {
          continue;
        }

        if (item.str === "◊") {
          mayContain.push(allergen);
        } else {
          allergens.push(allergen);
        }
      }

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens,
          category: categories[clusterIndex],
          description: "Official Denny's allergen guide PDF.",
          imageUrl: null,
          mayContain,
          name,
          sourceKind: "pdf-matrix",
          sourceUrl: url,
          variantGroup: categories[clusterIndex],
        }),
      );
    });
  }

  return records;
}

function cleanDennysPdfName(value) {
  return cleanText(value)?.replace(/\s+/g, " ").trim();
}

function isDennysPdfItemName(name) {
  if (!isProbablyMenuItemName(name)) {
    return false;
  }

  return (
    !/^(?:•|A =|F =|SM =|CO$|X -|◊ -|\(|of any allergen|the following code|A\s+A|A\s+ALLE|key$)/i.test(
      name,
    ) &&
    !/\b(?:registered trademarks|encourage any guest|allergen guide provides|shared preparation|ingredient suppliers|contains beef|made in the traditional method)\b/i.test(
      name,
    )
  );
}

function closestDennysAllergenColumn(x, columns) {
  const closest = columns
    .map((column) => ({ ...column, distance: Math.abs(column.x - x) }))
    .sort((left, right) => left.distance - right.distance)[0];

  return closest?.distance <= 12 ? closest.allergen : null;
}

async function extractSonicNutritionPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const records = [];

  for (const row of rows) {
    const parts = row.items
      .map((item) => cleanSonicNutritionText(item.str))
      .filter(Boolean);
    const parsed = parseSonicNutritionRow(parts);

    if (!parsed) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.unavailable,
        allergens: [],
        category: restaurant.category,
        description: "Official Sonic nutritional brochure.",
        imageUrl: null,
        mayContain: [],
        name: parsed.name,
        nutritionFacts: nutritionFactsFromSonicValues(parsed.values),
        sourceKind: "pdf-nutrition",
        sourceUrl: url,
      }),
    );
  }

  return dedupeRecordsByNameAndNutrition(records);
}

function parseSonicNutritionRow(parts) {
  if (parts.length < 11) {
    return null;
  }

  const values = [];

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (!isNutritionValueToken(parts[index])) {
      break;
    }

    values.unshift(parts[index]);
  }

  if (values.length < 10) {
    return null;
  }

  const name = cleanSonicNutritionName(
    parts.slice(0, parts.length - values.length).join(" "),
  );

  if (!name || !isSonicNutritionItemName(name)) {
    return null;
  }

  return { name, values: values.slice(0, 10) };
}

function nutritionFactsFromSonicValues(values) {
  return normalizeNutritionFacts({
    Calories: values[0],
    "Total Fat": values[1],
    "Saturated Fat": values[2],
    "Trans Fat": values[3],
    Cholesterol: values[4],
    Sodium: values[5],
    "Total Carbohydrates": values[6],
    "Dietary Fiber": values[7],
    Sugars: values[8],
    Protein: values[9],
  });
}

function cleanSonicNutritionText(value) {
  return cleanText(value)
    ?.replace(/[∆®™]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSonicNutritionName(value) {
  return cleanText(value)
    ?.replace(/\bSuper\s+SONIC\b/gi, "SuperSONIC")
    .replace(/\bSONIC\s+BLAST\b/gi, "SONIC BLAST")
    .replace(/\bTOASTE\s+R\b/gi, "TOASTER")
    .replace(/\bB\s+R\s+EA\s+K\s+FAST\s+TOASTER\b/gi, "BREAKFAST TOASTER")
    .replace(/\s+\(([^)]+)\)/g, " ($1)")
    .replace(/\s+/g, " ")
    .trim();
}

function isSonicNutritionItemName(name) {
  if (!name || name.length < 3 || name.length > 110) {
    return false;
  }

  if (
    /^(?:TOTAL|CALORIES|BURGERS|MAKE IT YOURS|WACKY PACK|KIDS MEALS|CHICKEN|SANDWICHES|HOT DOGS|BREAKFAST|COFFEE|SNACKS|SIDES|SONIC BLAST|NUTRITIONAL|INFORMATION|SPRING|From indulgent|Products with|There may be)/i.test(
      name,
    )
  ) {
    return false;
  }

  return /[a-z0-9]/i.test(name);
}

function dedupeRecordsByNameAndNutrition(records) {
  const byKey = new Map();

  for (const record of records) {
    const key = `${similarityKey(record.name)}:${record.nutritionFacts?.Calories ?? ""}`;

    if (!byKey.has(key)) {
      byKey.set(key, record);
    }
  }

  return Array.from(byKey.values());
}

async function extractSonicAllergenPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const marks = await readPdfVectorMarks(buffer);
  const records = [];
  let currentCategory = null;
  let previousCandidate = null;

  for (const row of rows) {
    const leftText = cleanSonicPdfName(
      row.items
        .filter((item) => item.x < 210)
        .map((item) => item.str)
        .join(" "),
    );
    const rowText =
      cleanText(row.items.map((item) => item.str).join(" ")) ?? "";

    if (!leftText) {
      continue;
    }

    if (isSonicAllergenHeaderRow(rowText)) {
      currentCategory = titleCase(leftText);
      previousCandidate = null;
      continue;
    }

    if (!isSonicAllergenItemName(leftText) || !currentCategory) {
      continue;
    }

    if (
      /^\(.+\)$/.test(leftText) &&
      previousCandidate &&
      previousCandidate.pageNumber === row.pageNumber
    ) {
      previousCandidate.name = `${previousCandidate.name} ${leftText}`;
      previousCandidate.yValues.push(row.y);
      continue;
    }

    const candidate = {
      category: currentCategory,
      name: leftText,
      pageNumber: row.pageNumber,
      yValues: [row.y],
    };
    records.push(candidate);
    previousCandidate = candidate;
  }

  return records.map((record) => {
    const rowMarks = marks.filter(
      (mark) =>
        mark.pageNumber === record.pageNumber &&
        record.yValues.some((y) => Math.abs(mark.centerY - y) <= 14),
    );
    const allergens = [];
    const mayContain = [];

    for (const mark of rowMarks) {
      const allergen = closestSonicAllergenColumn(mark.centerX);

      if (!allergen) {
        continue;
      }

      if (mark.type === "contains") {
        allergens.push(allergen);
      } else {
        mayContain.push(allergen);
      }
    }

    return createRecord({
      allergenSourceType: allergenSourceTypes.officialAllergenMenu,
      allergens,
      category: record.category,
      description: "Official Sonic national allergen guide.",
      imageUrl: null,
      mayContain,
      name: record.name,
      sourceKind: "pdf-matrix",
      sourceUrl: url,
      variantGroup: record.category,
    });
  });
}

function isSonicAllergenHeaderRow(text) {
  return (
    /\bMILK\b/i.test(text) && /\bEGG\b/i.test(text) && /\bGLUTEN\b/i.test(text)
  );
}

function isSonicAllergenItemName(name) {
  if (!name || name.length < 2 || name.length > 90) {
    return false;
  }

  if (
    /^(?:CONTAINS|MAY CONTAIN|Allergen|WARNING|Products with|This information|Ingredients in|Toast\.|gluten because|peanuts and|come in contact)/i.test(
      name,
    )
  ) {
    return false;
  }

  if (!/[a-z0-9]/i.test(name)) {
    return false;
  }

  if (skipNamePatterns.some((pattern) => pattern.test(name))) {
    return false;
  }

  return true;
}

function cleanSonicPdfName(value) {
  return cleanText(value)
    ?.replace(/[∆#Ω†]/g, "")
    .replace(/\s*[®™]\s*/g, " ")
    .replace(/\s+\)/g, ")")
    .replace(/\(\s+/g, "(")
    .replace(/\s+/g, " ")
    .trim();
}

function sonicAllergenColumns() {
  return [
    { allergen: "milk", x: 232 },
    { allergen: "egg", x: 267 },
    { allergen: "soy", x: 301 },
    { allergen: "tree-nut", x: 327 },
    { allergen: "peanut", x: 362 },
    { allergen: "fish", x: 401 },
    { allergen: "shellfish", x: 426 },
    { allergen: "wheat", x: 464 },
    { allergen: "gluten", x: 496 },
    { allergen: "sesame", x: 529 },
  ];
}

function closestSonicAllergenColumn(x) {
  const closest = sonicAllergenColumns()
    .map((column) => ({ ...column, distance: Math.abs(column.x - x) }))
    .sort((left, right) => left.distance - right.distance)[0];

  return closest?.distance <= 18 ? closest.allergen : null;
}

async function extractMezehAllergenPdfItems(buffer, restaurant, url) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 4);
  const marks = await readPdfVectorMarks(buffer, classifyMezehVectorMark);
  const candidates = [];
  let currentCategory = restaurant.category;

  for (const row of rows.filter((entry) => entry.pageNumber >= 3)) {
    const rowText =
      cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const leftText = cleanMezehPdfText(
      row.items
        .filter((item) => item.x < 155)
        .map((item) => item.str)
        .join(" "),
    );

    if (!leftText) {
      continue;
    }

    if (isMezehAllergenHeaderRow(rowText)) {
      currentCategory = mezehCategoryName(leftText, currentCategory);
      continue;
    }

    if (!currentCategory || !isMezehMenuItemName(leftText)) {
      continue;
    }

    candidates.push({
      category: currentCategory,
      name: leftText,
      pageNumber: row.pageNumber,
      y: row.y,
    });
  }

  const records = candidates.map((candidate) => {
    const rowMarks = marks.filter(
      (mark) =>
        mark.pageNumber === candidate.pageNumber &&
        Math.abs(mark.centerY - candidate.y) <= 9,
    );
    const allergens = rowMarks
      .map((mark) => closestMezehAllergenColumn(mark.centerX))
      .filter(Boolean);

    return createRecord({
      allergenSourceType: allergenSourceTypes.officialAllergenMenu,
      allergens: uniqueStrings(allergens),
      category: candidate.category,
      description: "Official Mezeh nutrition and allergen PDF.",
      imageUrl: null,
      mayContain: [],
      name: candidate.name,
      sourceKind: "pdf-matrix",
      sourceUrl: url,
      variantGroup: candidate.category,
    });
  });

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function classifyMezehVectorMark(box, fillColor) {
  if (!box || box.x < 160 || box.x > 575 || box.y < 20 || box.y > 980) {
    return null;
  }

  if (
    isClosePdfColor(fillColor, "#000000") &&
    box.width >= 2 &&
    box.width <= 8 &&
    box.height >= 2 &&
    box.height <= 8
  ) {
    return {
      centerX: box.x + box.width / 2,
      centerY: box.y + box.height / 2,
      type: "contains",
    };
  }

  return null;
}

function closestMezehAllergenColumn(x) {
  const columns = [
    { allergen: "tree-nut", x: 181 },
    { allergen: "milk", x: 223 },
    { allergen: "egg", x: 264 },
    { allergen: "wheat", x: 306 },
    { allergen: "soy", x: 347 },
    { allergen: "sesame", x: 389 },
    { allergen: "shellfish", x: 430 },
  ];
  const closest = columns
    .map((column) => ({ ...column, distance: Math.abs(column.x - x) }))
    .sort((left, right) => left.distance - right.distance)[0];

  return closest?.distance <= 16 ? closest.allergen : null;
}

function isMezehAllergenHeaderRow(text) {
  return (
    /\bNUTS\b/i.test(text) &&
    /\bMILK\b/i.test(text) &&
    /\bSHELLFISH\b/i.test(text)
  );
}

function isMezehMenuItemName(value) {
  return (
    Boolean(value) &&
    value.length >= 3 &&
    value.length <= 80 &&
    isProbablyMenuItemName(value) &&
    !/^(?:allergen info|signature menu|build your own|\(|\)|contains|fits the diet)$/i.test(
      value,
    )
  );
}

function mezehCategoryName(value, fallback) {
  const normalized = cleanMezehPdfText(value)
    ?.replace(/\bG\s*IN\b/i, "Grain")
    .replace(/\bSA\s*D\b/i, "Salad")
    .replace(/\bW\s*PS\b/i, "Wraps")
    .replace(/\bP\s*TEINS\b/i, "Proteins")
    .replace(/\bSNAC\b/i, "Snack")
    .replace(/\s+/g, " ");

  if (!normalized) {
    return fallback;
  }

  if (/^g(?:r)?ain bowls$/i.test(normalized)) {
    return "Grain Bowls";
  }
  if (/^salad bowls$/i.test(normalized)) {
    return "Salad Bowls";
  }
  if (/^mixed bowls$/i.test(normalized)) {
    return "Mixed Bowls";
  }
  if (/^wraps$/i.test(normalized)) {
    return "Wraps";
  }
  if (/^snack.*sweets$/i.test(normalized)) {
    return "Snacks & Sweets";
  }
  if (/^bases$/i.test(normalized)) {
    return "Bases";
  }
  if (/^proteins$/i.test(normalized)) {
    return "Proteins";
  }
  if (/^toppings$/i.test(normalized)) {
    return "Toppings";
  }
  if (/^sauces$/i.test(normalized)) {
    return "Sauces";
  }

  return titleCase(normalized);
}

function cleanMezehPdfText(value) {
  return cleanText(value)
    ?.replace(/[\uf006\uf008\uf00b\uf00d\uf00e\uf010\uf018]/g, "")
    .replace(/\bF E\b/i, "Free")
    .replace(/\bG TEN\b/i, "Gluten")
    .replace(/\s+/g, " ")
    .trim();
}

function isSubwayNutritionPdf(text, url) {
  return (
    /us-nutrition/i.test(url) ||
    (/Nutrition Information/i.test(text) && /\bCalories\b/i.test(text))
  );
}

function isSubwayIngredientPdf(text, url) {
  return (
    /us-ingredients/i.test(url) || /\bINGREDIENT INFORMATION\b/i.test(text)
  );
}

function isSubwayAllergenPdf(text, url) {
  if (/us-ingredients/i.test(url) || /\bINGREDIENT INFORMATION\b/i.test(text)) {
    return false;
  }

  return (
    /us-allergens|US_Allergen_chart/i.test(url) ||
    (/\b(?:Allergy|Allergen|Sensitivity) Information\b/i.test(text) &&
      /\b(?:Egg|Fish|Milk|Peanuts?|Sesame|Shellfish|Soy|Tree Nuts?|Wheat|Gluten|Sulfites)\b/i.test(
        text,
      ))
  );
}

function extractSubwayNutritionPdfItems(text, restaurant, url) {
  const records = [];
  let currentCategory = restaurant.category;
  const valuePattern = "(?:<\\s*1|\\d+(?:\\.\\d+)?)";
  const nutritionRowPattern = new RegExp(
    `^(.+?)\\s+(${valuePattern})\\s+(${valuePattern})\\s+(${valuePattern})\\s+(${valuePattern})\\s+(${valuePattern})\\s+(${valuePattern})\\s+(${valuePattern})\\s+(${valuePattern})\\s+(${valuePattern})\\s+(${valuePattern})\\s+(${valuePattern})\\s+(${valuePattern})\\s+(${valuePattern})\\s+(${valuePattern})\\s+(${valuePattern})\\s+(${valuePattern})$`,
  );

  for (const rawLine of text.split(/\r?\n/)) {
    const line = cleanText(rawLine);

    if (!line) {
      continue;
    }

    const category = subwayNutritionCategory(line);

    if (category) {
      currentCategory = category;
      continue;
    }

    const match = line.match(nutritionRowPattern);

    if (!match) {
      continue;
    }

    const baseName = cleanSubwayNutritionName(match[1]);

    if (!baseName || !isProbablyMenuItemName(baseName)) {
      continue;
    }

    const nutritionFacts = nutritionFactsFromSubwayValues(match.slice(2));
    const names = subwayNutritionAliases(baseName);

    for (const name of names) {
      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.unavailable,
          allergens: [],
          category: currentCategory,
          description: "Official Subway U.S. nutrition PDF.",
          imageUrl: null,
          mayContain: [],
          name,
          nutritionFacts,
          sourceKind: "pdf-nutrition",
          sourceUrl: url,
          variantGroup: currentCategory,
        }),
      );
    }
  }

  return records;
}

function subwayNutritionCategory(line) {
  if (/^Breads$/i.test(line)) {
    return "Breads & Wraps";
  }

  if (/^BREADS & INGREDIENTS$/i.test(line)) {
    return "Breads & Wraps";
  }

  if (/^Sandwich Condiments and Toppings$/i.test(line)) {
    return "Condiments & Dressings";
  }

  if (/^Vegetables$/i.test(line)) {
    return "Vegetables";
  }

  if (/^Cheese$/i.test(line)) {
    return "Cheese";
  }

  if (/^Individual Proteins$/i.test(line)) {
    return "Meat, Poultry, Seafood & Eggs";
  }

  if (/^Cookies & Sides$/i.test(line)) {
    return "Cookies & Desserts";
  }

  return null;
}

function cleanSubwayNutritionName(value) {
  return cleanText(value)
    ?.replace(/\*\*/g, "")
    .replace(/[®™]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function subwayNutritionAliases(name) {
  const aliases = new Set([name]);
  const withoutSize = name
    .replace(/^6"\s+/i, "")
    .replace(/^9"\s+/i, "")
    .replace(/\s+\(\s*Pocket\s*\)$/i, "")
    .trim();

  if (withoutSize && withoutSize !== name) {
    aliases.add(withoutSize);
  }

  const aliasMap = new Map([
    ["American", ["American Cheese, Processed"]],
    ["Artisan Flatbread", ["Flatbread"]],
    ["Artisan Italian Bread", ["Italian Herbs and Cheese", "Parmesan Oregano"]],
    ["Baja Chipotle", ["Baja Chipotle Sauce"]],
    ["Broccoli Cheddar", ["Broccoli & Cheddar"]],
    ["Buffalo Sauce", ["Buffalo Sauce"]],
    ["Cheddar Cheese Sauce", ["Cheddar Cheese Sauce"]],
    ["Chicken Noodle", ["Chicken Noodle"]],
    ["Chocolate Chip Cookie", ["Cookie, Chocolate Chip"]],
    ["Cookie, Footlong Chocolate Chip", ["Footlong Cookie, Chocolate Chip"]],
    ["Creamy Sriracha", ["Sriracha Sauce"]],
    ["Double Chocolate Cookie", ["Cookie, Double Chocolate"]],
    ["Egg Patty", ["Egg Omelet Patty (Regular)", "Eggs, Cage-Free"]],
    ["Cheese", ["Pizza, Cheese"]],
    [
      "Grilled Chicken",
      ["Chicken, Grilled", "Chicken, Grilled (with Buffalo sauce)"],
    ],
    ["Honey Mustard", ["Honey Mustard Sauce"]],
    ["Jalapeño Cheddar Bread", ["Jalapeno Cheddar"]],
    ["Loaded Baked Potato with Bacon", ["Loaded Baked Potato"]],
    ["Mayonnaise", ["Mayonnaise, Regular"]],
    ["Meatballs", ["Meatballs & Marinara"]],
    [
      "Monterey Cheddar, Shredded",
      ["Monterey & Cheddar Cheese Blend, Shredded", "Monterey Cheddar"],
    ],
    ["MVP Parmesan Vinaigrette", ["MVP Parmesan Vinaigrette®"]],
    ["Mustard, Yellow", ["Yellow Mustard"]],
    [
      "Naturally Flavored Raspberry Cheesecake Cookie",
      ["Cookie, Naturally Flavored Raspberry Cheesecake"],
    ],
    ["Oatmeal Raisin Cookie", ["Cookie, Oatmeal Raisin"]],
    ["Parmesan Grated", ["Parmesan Cheese"]],
    ["Pepper Jack", ["Pepperjack Cheese"]],
    ["Peppercorn Ranch", ["Peppercorn Ranch Sauce"]],
    ["Provolone", ["Provolone Cheese"]],
    ["Roasted Garlic Aioli", ["Roasted Garlic Aioli"]],
    [
      "Sweet Onion Teriyaki",
      ["Sweet Onion Teriyaki Sauce (Contains Poppy Seeds)"],
    ],
    ["Tuna", ["Tuna Salad"]],
    ["Veggie Patty", ["Veggie Patty"]],
    ["White Chip Macadamia Nut Cookie", ["Cookie, White Chip Macadamia Nut"]],
  ]);

  for (const candidate of [name, withoutSize]) {
    for (const alias of aliasMap.get(candidate) ?? []) {
      aliases.add(alias);
    }
  }

  return Array.from(aliases).filter(Boolean);
}

function nutritionFactsFromSubwayValues(values) {
  return normalizeNutritionFacts({
    "Serving Size": `${values[0]} g`,
    Calories: values[1],
    "Total Fat": values[2],
    "Saturated Fat": values[3],
    "Trans Fat": values[4],
    Cholesterol: values[5],
    Sodium: values[6],
    "Total Carbohydrates": values[7],
    "Dietary Fiber": values[8],
    Sugars: values[9],
    "Added Sugars": values[10],
    Protein: values[11],
    "Vitamin A": values[12],
    "Vitamin C": values[13],
    Calcium: values[14],
    Iron: values[15],
  });
}

async function extractSubwayPdfItems(buffer, restaurant, url) {
  const records = [];
  const officialAllergenCoveredIds = subwayPdfAllergenCoverage();
  const pdfjsLib = await getPdfJsLib();
  const document = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
    .promise;
  let currentCategory = restaurant.category;

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const rows = groupPdfTextRows(textContent.items);

      for (const row of rows) {
        const nameParts = row
          .filter((item) => item.x < 205)
          .map((item) => item.str)
          .filter(
            (part) =>
              !/^(-- \d+ of \d+ --|U\.S\. Allergy|November|This list|manufacturers|ingredient changes|include some|may come|chart\.|●=|¹|\*\*|2 The|\*Only)/i.test(
                part,
              ),
          );
        const name = cleanText(nameParts.join(" "));

        if (!name) {
          continue;
        }

        if (matrixSectionNames.has(name)) {
          currentCategory = name;
          continue;
        }

        const direct = [];
        const mayContain = [];
        const markers = row.filter((item) =>
          /^(?:●|x|X|\*\*)$/.test(item.str.trim()),
        );

        for (const marker of markers) {
          const allergens = closestSubwayAllergens(marker.x);

          if (marker.str === "●") {
            direct.push(...allergens);
          } else {
            mayContain.push(...allergens);
          }
        }

        if (direct.length === 0 && mayContain.length === 0) {
          continue;
        }

        if (
          !isProbablyMenuItemName(name) ||
          !isProbablySubwayAllergenMatrixItemName(name, currentCategory)
        ) {
          continue;
        }

        const itemName = normalizeSubwayItemName(name, currentCategory);

        records.push(
          createRecord({
            allergenSourceType: allergenSourceTypes.officialAllergenMenu,
            allergens: direct,
            officialAllergenCoveredIds,
            category: currentCategory,
            description:
              "Official Subway U.S. Allergy and Sensitivity Information matrix.",
            imageUrl: null,
            mayContain,
            name: itemName,
            sourceKind: "pdf-matrix",
            sourceUrl: url,
          }),
        );
      }
    }
  } finally {
    await document.destroy();
  }

  return records;
}

export function subwayPdfAllergenCoverage() {
  return uniqueStrings(subwayPdfColumns.map((column) => column.id)).sort();
}

function isProbablySubwayAllergenMatrixItemName(name, category) {
  const cleaned = cleanMenuName(name);

  if (!cleaned || !matrixSectionNames.has(category)) {
    return false;
  }

  if (
    /^(?:as ingredients|food manufacturers|however|this list|vary)$/i.test(
      cleaned,
    ) ||
    /^[a-z]/.test(cleaned) ||
    /[,;:[\]]/.test(cleaned) ||
    /\b(?:acid|anti|ascorbic|calcium|cultured|dextrose|diglycerides|enzymes|fermented|flour|ingredient|ingredients|inhibitor|manufacturer|manufacturers|mold|nitrate|oil|paprika|pasteurized|potassium|provided|riboflavin|salt|silicon|skim|sodium|soybean|substitutions|thiamine|wheat flour|xanthan)\b/i.test(
      cleaned,
    )
  ) {
    return false;
  }

  return true;
}

function normalizeSubwayItemName(name, category) {
  if (category !== "Cheese") {
    return name;
  }

  const cheeseNames = new Map([
    ["American, Processed", "American Cheese, Processed"],
    ["Mozzarella, Shredded", "Mozzarella Cheese, Shredded"],
    ["Parmesan", "Parmesan Cheese"],
    ["Pepperjack", "Pepperjack Cheese"],
    ["Provolone", "Provolone Cheese"],
    ["Swiss", "Swiss Cheese"],
  ]);

  return cheeseNames.get(name) ?? name;
}

function groupPdfTextRows(items) {
  const rows = [];

  for (const item of items) {
    const text = cleanText(item.str);

    if (!text) {
      continue;
    }

    const x = item.transform[4];
    const y = item.transform[5];
    const row = rows.find((candidate) => Math.abs(candidate.y - y) < 2);

    if (row) {
      row.items.push({ str: text, x, y });
    } else {
      rows.push({ y, items: [{ str: text, x, y }] });
    }
  }

  return rows
    .map((row) => row.items.sort((a, b) => a.x - b.x))
    .sort((a, b) => b[0].y - a[0].y);
}

function closestSubwayAllergens(x) {
  const closest = subwayPdfColumns.reduce(
    (best, column) => {
      const distance = Math.abs(column.x - x);
      return distance < best.distance ? { column, distance } : best;
    },
    { column: null, distance: Number.POSITIVE_INFINITY },
  );

  return closest.column && closest.distance < 13 ? [closest.column.id] : [];
}

function extractDocumentLinks($, url) {
  const links = [];

  $("a[href]").each((_index, element) => {
    const href = absolutizeUrl($(element).attr("href"), url);
    const text = cleanText($(element).text()) ?? "";

    if (!href) {
      return;
    }

    if (/\/https?:\/\//i.test(href)) {
      return;
    }

    const haystack = `${href} ${text}`.toLowerCase();

    if (!/(allergen|nutrition|ingredient|pdf|xlsx|xls|csv)/.test(haystack)) {
      return;
    }

    if (
      !/\.(pdf|xlsx?|csv)(?:[?#]|$)/i.test(href) &&
      !directGoogleDriveDownloadUrl(href)
    ) {
      return;
    }

    links.push({ label: text, url: href });
  });

  $("iframe[src],embed[src],object[data]").each((_index, element) => {
    const source =
      $(element).attr("data-lazy-src") ??
      $(element).attr("data-src") ??
      $(element).attr("src") ??
      $(element).attr("data");
    const href = absolutizeUrl(source, url);
    const label =
      cleanText(
        [
          $(element).attr("title"),
          $(element).attr("aria-label"),
          $(element).attr("alt"),
          $(element)
            .closest("article,section,div")
            .find("h1,h2,h3")
            .first()
            .text(),
        ]
          .filter(Boolean)
          .join(" "),
      ) ?? "";

    if (!href) {
      return;
    }

    const haystack = `${href} ${label}`.toLowerCase();

    if (
      !/(allergen|allergy|allergies|nutrition|ingredient|pdf|xlsx|xls|csv)/.test(
        haystack,
      )
    ) {
      return;
    }

    if (
      !/\.(pdf|xlsx?|csv)(?:[?#]|$)/i.test(href) &&
      !/(allergen|allergies|allergy|nutrition|ingredient)/.test(haystack)
    ) {
      return;
    }

    links.push({ label, url: href });
  });

  return uniqueBy(links, (link) => normalizeUrl(link.url)).slice(0, 12);
}

function discoveredOfficialDocumentRole(link) {
  const haystack = `${link?.url ?? ""} ${link?.label ?? ""}`;

  if (
    /\b(?:allergens?|allergies|allergy|ingredients?|dietary|sensitivity|sensitivities)\b/i.test(
      haystack,
    )
  ) {
    return "official-allergen";
  }

  if (/\b(?:nutrition|nutritional)\b/i.test(haystack)) {
    return "official-nutrition";
  }

  return "official-allergen";
}

function officialPageLinkRole(link) {
  const haystack = `${link?.url ?? ""} ${link?.label ?? ""}`;

  if (isLikelyMenuItemDetailOfficialFalsePositive(link)) {
    return null;
  }

  if (/\b(?:nutrition|nutritional|calculator)\b/i.test(haystack)) {
    return "official-nutrition";
  }

  if (
    /\b(?:allergens?|allergies|allergy|dietary|sensitivity|sensitivities)\b/i.test(
      haystack,
    )
  ) {
    return "official-allergen";
  }

  if (/\bingredients?\b/i.test(haystack)) {
    return "official-ingredients";
  }

  return "official-allergen";
}

function isLikelyMenuItemDetailOfficialFalsePositive(link) {
  const label = cleanText(link?.label) ?? "";
  const rawUrl = link?.url ?? "";

  if (!rawUrl) {
    return false;
  }

  try {
    const parsed = new URL(rawUrl);
    const path = parsed.pathname;
    const query = parsed.search;

    if (
      /\/menus?(?:\/|$)|\/order(?:\/|$)/i.test(path) &&
      /\b(?:item|product|dish)=/i.test(query) &&
      !/\b(?:allergens?|allergies|allergy|nutrition|nutritional|calculator|dietary|sensitivity|sensitivities|ingredients?)\b/i.test(
        `${path} ${query}`.replace(/\b(?:item|product|dish)=[^&\s]+/gi, ""),
      )
    ) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function extractOfficialPageLinks($, url) {
  const links = [];

  $("a[href]").each((_index, element) => {
    const rawHref = $(element).attr("href");
    const href = absolutizeUrl(rawHref, url);
    const text =
      cleanText(
        [
          $(element).text(),
          $(element).attr("aria-label"),
          $(element).attr("title"),
        ]
          .filter(Boolean)
          .join(" "),
      ) ?? "";

    if (!href || !isSameSite(href, url)) {
      return;
    }

    if (rawHref?.startsWith("#")) {
      return;
    }

    if (/\.(?:pdf|xlsx?|csv|jpe?g|png|webp|gif|svg)(?:[?#]|$)/i.test(href)) {
      return;
    }

    const haystack = `${href} ${text}`;

    if (
      !/\b(?:allergens?|allergies|allergy|ingredients?|nutrition|nutritional|calculator|dietary|sensitivity|sensitivities)\b/i.test(
        haystack,
      )
    ) {
      return;
    }

    if (
      /\b(?:order|delivery|takeout|reservation|catering|careers?|jobs?|gift\s*card|privacy|terms|contact)\b/i.test(
        haystack,
      )
    ) {
      return;
    }

    if (
      isLikelyMenuItemDetailOfficialFalsePositive({ label: text, url: href })
    ) {
      return;
    }

    links.push({ label: text, url: href });
  });

  return uniqueBy(links, (link) => normalizeUrl(link.url)).slice(0, 8);
}

function extractMenuPageLinks($, url) {
  const links = [];
  const current = stripHashFromUrl(url);
  let currentPathname = "";

  try {
    currentPathname = new URL(url).pathname;
  } catch {
    currentPathname = "";
  }

  $("a[href]").each((_index, element) => {
    const href = absolutizeUrl($(element).attr("href"), url);
    const text =
      cleanText($(element).text()) ??
      cleanText($(element).attr("aria-label")) ??
      "";

    if (
      !href ||
      (!isSameSite(href, url) &&
        !isTrustedExternalMenuPageLink(href, text, url))
    ) {
      return;
    }

    if (
      stripHashFromUrl(href) === current ||
      /\.(?:pdf|xlsx?|csv|jpe?g|png|webp|gif|svg)(?:[?#]|$)/i.test(href)
    ) {
      return;
    }

    let pathname = "";

    try {
      pathname = new URL(href).pathname;
    } catch {
      pathname = "";
    }

    if (/\/(?:locations?|tags?)(?:\/|$)/i.test(pathname)) {
      return;
    }

    const compactPathname = pathname.replace(/^\/+|\/+$/g, "");

    if (
      compactPathname &&
      !compactPathname.includes("/") &&
      !isMenuPageLinkCandidate(compactPathname) &&
      !isMenuPageLinkCandidate(text)
    ) {
      return;
    }

    if (
      compactPathname &&
      !compactPathname.includes("/") &&
      !isMenuPageLinkCandidate(compactPathname) &&
      /,\s*[A-Z]{2}\b/.test(text)
    ) {
      return;
    }

    const locationMenuMatch = /^\/menu\/([^/?#]+)/i.exec(pathname);

    if (
      locationMenuMatch &&
      currentPathname !== "/" &&
      !currentPathname
        .toLowerCase()
        .includes(locationMenuMatch[1].toLowerCase())
    ) {
      return;
    }

    const haystack = `${href} ${text}`;

    if (!isMenuPageLinkCandidate(haystack)) {
      return;
    }

    if (
      /\b(?:cocktail|wine|beer|beverage|drink|catering|private\s*event|gift\s*card|careers?|jobs?|loyalty|rewards?|reservation|order|delivery|takeout)\b/i.test(
        haystack,
      ) &&
      !isSpecialFoodMenuPageLink(haystack)
    ) {
      return;
    }

    links.push({ label: text, url: href });
  });

  return uniqueBy(links, (link) => stripHashFromUrl(link.url)).slice(0, 12);
}

function isTrustedExternalMenuPageLink(href, label, sourceUrl) {
  let target;
  let source;

  try {
    target = new URL(href);
    source = new URL(sourceUrl);
  } catch {
    return false;
  }

  if (target.hostname === source.hostname) {
    return true;
  }

  const host = target.hostname.replace(/^www\./i, "");
  const path = target.pathname;
  const haystack = `${href} ${label}`;

  if (
    !/(?:^|\.)squarespace\.com$|^g\.snyit\.com$|^(?:drive|docs)\.google\.com$/i.test(
      host,
    )
  ) {
    return false;
  }

  if (!isMenuPageLinkCandidate(haystack)) {
    return false;
  }

  if (/\.(?:pdf|xlsx?|csv|jpe?g|png|webp|gif|svg)(?:[?#]|$)/i.test(path)) {
    return false;
  }

  return !/\b(?:cocktail|wine|beer|beverage|drink|catering|private\s*event|gift\s*card|careers?|jobs?|loyalty|rewards?|reservation|order|delivery|takeout|privacy|terms)\b/i.test(
    haystack,
  );
}

function isThirdPartyMarketplaceUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "");

    return /^(?:grubhub|ubereats|doordash|seamless|postmates|slicelife)\.com$/i.test(
      host,
    );
  } catch {
    return false;
  }
}

export function directGoogleDriveDownloadUrl(url) {
  let parsed;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./i, "");

  if (!/^(?:drive|docs)\.google\.com$/i.test(host)) {
    return null;
  }

  const fileMatch = /\/file\/d\/([^/?#]+)/i.exec(parsed.pathname);
  const id = fileMatch?.[1] ?? parsed.searchParams.get("id");

  if (!id) {
    return null;
  }

  if (
    /\/uc$/i.test(parsed.pathname) &&
    parsed.searchParams.get("export") === "download"
  ) {
    return null;
  }

  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
}

function extractCommonMenuPathLinks($, url) {
  if (!isSquarespacePage($)) {
    return [];
  }

  let parsed;

  try {
    parsed = new URL(url);
  } catch {
    return [];
  }

  const pathname = parsed.pathname.replace(/\/+$/g, "") || "/";

  if (
    pathname !== "/" &&
    !/^\/(?:home|welcome|locations?\/[^/]+)$/i.test(pathname)
  ) {
    return [];
  }

  const menuUrl = new URL("/menu", parsed.origin).toString();

  if (stripHashFromUrl(menuUrl) === stripHashFromUrl(url)) {
    return [];
  }

  return [{ label: "Common menu page", url: menuUrl }];
}

function extractSinglePlatformMenuPageLinks($, url) {
  const links = [];
  const snippets = [$.html() ?? ""];

  $("script[src], [data-location]").each((_index, element) => {
    const attrs = element.attribs ?? {};
    snippets.push(
      Object.entries(attrs)
        .map(([key, value]) => `${key}="${value}"`)
        .join(" "),
    );
  });

  for (const rawSnippet of snippets) {
    const text = decodeHtml(String(rawSnippet ?? ""))
      .replace(/\\"/g, '"')
      .replace(/\\\//g, "/");

    if (!/menus\.singleplatform\.[a-z.]+\/widget/i.test(text)) {
      continue;
    }

    const domainMatch = /menus\.(singleplatform\.[a-z.]+)\/widget/i.exec(text);
    const placesHost = `places.${domainMatch?.[1] ?? "singleplatform.com"}`;
    let match;
    const locationPattern =
      /\bdata-location\s*=\s*["']([^"']+)["']|\blocation\s*[:=]\s*["']([a-z0-9_-]+)["']/gi;

    while ((match = locationPattern.exec(text))) {
      const locationId = cleanText(match[1] ?? match[2]);

      if (!locationId || !/^[a-z0-9_-]+$/i.test(locationId)) {
        continue;
      }

      links.push({
        label: "SinglePlatform menu",
        url: `https://${placesHost}/${locationId}/menu`,
      });
    }
  }

  return uniqueBy(links, (link) => normalizeUrl(link.url)).slice(0, 6);
}

function extractPopmenuMenuPageLinks($, restaurant, url) {
  const links = [];
  let currentPathname = "";

  try {
    currentPathname = new URL(url).pathname;
  } catch {
    currentPathname = "";
  }

  $("script#popmenu-apollo-state, script").each((_index, element) => {
    const text = $(element).contents().text();

    if (!text.includes("Popmenu") && !text.includes("POPMENU_APOLLO_STATE")) {
      return;
    }

    const urlPattern = /"url"\s*:\s*"([^"]*menu[^"]*)"/gi;
    let match;

    while ((match = urlPattern.exec(text))) {
      const href = absolutizeUrl(decodeJavaScriptString(match[1]), url);

      if (!href || !isSameSite(href, url)) {
        continue;
      }

      let pathname = "";

      try {
        pathname = new URL(href).pathname;
      } catch {
        pathname = "";
      }

      const haystack = `${pathname} ${href}`;
      const isRootPage = currentPathname === "/" || currentPathname === "";
      const isMenuLandingPage = /^\/(?:menu|[^/]+-menu)$/i.test(
        currentPathname,
      );
      const isMenuSectionPage = /^\/menus\//i.test(currentPathname);

      if (isRootPage && pathname !== "/menu") {
        continue;
      }

      if (isMenuLandingPage && !/^\/menus\//i.test(pathname)) {
        continue;
      }

      if (isMenuSectionPage) {
        continue;
      }

      if (
        !pathname ||
        /^\/items\//i.test(pathname) ||
        /\.(?:pdf|xlsx?|csv|jpe?g|png|webp|gif|svg)(?:[?#]|$)/i.test(href) ||
        !isMenuPageLinkCandidate(haystack) ||
        /\b(?:cocktail|wine|beer|beverage|drink|catering|private\s*event|gift\s*card|careers?|jobs?|loyalty|rewards?|reservation|order|delivery|takeout|valentines?|valentine's|holiday[-\s]*special)\b/i.test(
          haystack,
        )
      ) {
        continue;
      }

      if (
        /dc|washington/i.test(
          `${restaurant.city ?? ""} ${restaurant.region ?? ""} ${restaurant.locationId ?? ""} ${url}`,
        ) &&
        /\b(?:west[-\s]?palm|florida|palm[-\s]?beach)\b/i.test(haystack)
      ) {
        continue;
      }

      links.push({ label: pathname, url: href });
    }
  });

  return uniqueBy(links, (link) => stripHashFromUrl(link.url)).slice(0, 24);
}

function isMenuPageLinkCandidate(haystack) {
  return /\b(?:menu|meal\s*kits?|take\s*out|takeout|breakfast|brunch|lunch|dinner|dessert|food|appetizers?|bowls?|burgers?|chicken|desserts?|dumplings?|entrees?|mains?|noodle|pasta|pizza|pork|rice|salads?|sandwiches|seafood|soup|steak|tacos?|vegetables?|wings?)\b/i.test(
    haystack,
  );
}

function isSpecialFoodMenuPageLink(haystack) {
  return /\b(?:meal\s*kits?|take\s*out|takeout)\b/i.test(haystack);
}

function extractToastOrderPageLinks($, url) {
  if (isToastOrderingPageUrl(url)) {
    return [];
  }

  const links = [];
  const candidates = [];

  $("[href]").each((_index, element) => {
    candidates.push($(element).attr("href"));
  });

  $(
    "[data-current-styles], [data-url], [data-href], [data-config], script",
  ).each((_index, element) => {
    const attrs = element.attribs ?? {};

    for (const value of Object.values(attrs)) {
      candidates.push(value);
    }

    if (element.tagName === "script") {
      candidates.push($(element).contents().text());
    }
  });

  for (const value of candidates) {
    const text = decodeHtml(String(value ?? "")).replace(/\\\//g, "/");

    for (const match of text.matchAll(
      /https?:\/\/(?:order\.toasttab\.com\/online\/[A-Za-z0-9._~:/?#[@!$&'()*+,;=%-]+|www\.toasttab\.com\/local\/order\/[A-Za-z0-9._~:/?#[@!$&'()*+,;=%-]+|www\.toasttab\.com\/[A-Za-z0-9._~:/?#[@!$&'()*+,;=%-]+\/v3\/?)/gi,
    )) {
      const href = absolutizeUrl(match[0].replace(/[),.;]+$/, ""), url);

      if (
        !href ||
        /(?:findcard|rewards|marketing-signup|gift|card|checkout)/i.test(href)
      ) {
        continue;
      }

      links.push({ label: "Toast online menu", url: href });
    }
  }

  return uniqueBy(links, (link) => normalizeUrl(link.url)).slice(0, 6);
}

function isToastOrderingPageUrl(url) {
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

function extractLaravelCategoryMenuLinks($, url) {
  const links = [];
  const scriptText = $("script")
    .map((_index, element) => $(element).contents().text())
    .get()
    .join("\n");
  const pageText = `${$.html() ?? ""}\n${scriptText}`;

  if (/categorywisedisplay\/all/i.test(pageText)) {
    const href = absolutizeUrl("categorywisedisplay/all", url);

    if (href) {
      links.push({ label: "Category menu API", url: href });
    }
  }

  for (const match of pageText.matchAll(/categorywise\/(\d+)/gi)) {
    const href = absolutizeUrl(`categorywise/${match[1]}`, url);

    if (href) {
      links.push({ label: "Category menu", url: href });
    }
  }

  return uniqueBy(links, (link) => normalizeUrl(link.url)).slice(0, 24);
}

const knownLocationScopeTokens = [
  "alexandria",
  "annandale",
  "annapolis",
  "arlington",
  "ashburn",
  "bethesda",
  "beverly-hills",
  "boston",
  "brookfield",
  "buckeystown",
  "burtonsville",
  "cabin-john",
  "centreville",
  "chantilly",
  "chicago",
  "college-park",
  "columbus",
  "dallas",
  "denver",
  "detroit",
  "dunn-loring",
  "fairfax",
  "falls-church",
  "gaithersburg",
  "gainesville",
  "gainsville",
  "glastonbury",
  "great-falls",
  "herndon",
  "hyattsville",
  "indianapolis",
  "kansas-city",
  "kensington",
  "laurel",
  "las-vegas",
  "lorton",
  "manassas",
  "manchester",
  "mclean",
  "miami",
  "naples",
  "nashville",
  "national-harbor",
  "north-arlington",
  "north-bethesda",
  "palm-beach",
  "purcellville",
  "reston",
  "rockville",
  "silver-spring",
  "springfield",
  "sterling",
  "takoma-park",
  "troy",
  "tysons",
  "union-square",
  "urbana",
  "waldorf",
  "washington",
  "west-village",
  "woodbridge",
];

function isDiscoveredPageRelevantToSource(source, link) {
  if (/food96\.com\/brands\//i.test(link?.url ?? "")) {
    return false;
  }

  const haystack = slugText(`${link?.url ?? ""} ${link?.label ?? ""}`);
  const sourceTokens = sourceLocationTokens(source);
  const explicitLocation = locationTokenFromUrl(link?.url);
  const pathLocationScope = menuLocationScopeFromUrl(link?.url);

  if (
    isFoundingFarmersSource(source) &&
    !isFoundingFarmersDiscoveredPageRelevantToSource(source, link)
  ) {
    return false;
  }

  if (!haystack || sourceTokens.length === 0) {
    return true;
  }

  if (explicitLocation) {
    return sourceTokens.some((token) => explicitLocation.includes(token));
  }

  if (pathLocationScope) {
    return sourceTokens.some((token) => pathLocationScope.includes(token));
  }

  if (sourceTokens.some((token) => haystack.includes(token))) {
    return true;
  }

  return !knownLocationScopeTokens.some((token) => haystack.includes(token));
}

function isFoundingFarmersSource(source) {
  try {
    return getBrandAdapter(source.id).brandKey === "founding-farmers";
  } catch {
    return /wearefoundingfarmers\.com/i.test(source?.domain ?? "");
  }
}

function isFoundingFarmersDiscoveredPageRelevantToSource(source, link) {
  const url = String(link?.url ?? "");

  if (!/wearefoundingfarmers\.com/i.test(url)) {
    return true;
  }

  const slug = slugText(url);
  const locationId = slugText(source?.locationId ?? "");

  if (
    /fishers|bakers|distillers|reston|tysons|fffb|ffd|ffbbq|allstores/i.test(
      slug,
    )
  ) {
    return false;
  }

  if (locationId.includes("dc")) {
    return /\b(?:ffdc|founding-farmers-dc|dc-breakfast|dc-brunch|dc-lunch|dc-dinner|dc-dessert|dc-drinks|menus-dc|location-dc|locations-dc)\b/i.test(
      slug,
    );
  }

  if (locationId.includes("reston")) {
    return /\b(?:ffrs|reston|reston-station)\b/i.test(slug);
  }

  if (locationId.includes("tysons")) {
    return /\b(?:ffty|tysons)\b/i.test(slug);
  }

  return true;
}

function discoveredPageMatchesSourceLocation(source, link) {
  const haystack = slugText(`${link?.url ?? ""} ${link?.label ?? ""}`);
  const sourceTokens = sourceLocationTokens(source);
  const explicitLocation = locationTokenFromUrl(link?.url);

  if (explicitLocation) {
    return (
      sourceTokens.length > 0 &&
      sourceTokens.some((token) => explicitLocation.includes(token))
    );
  }

  return (
    sourceTokens.length > 0 &&
    sourceTokens.some((token) => haystack.includes(token))
  );
}

function locationTokenFromUrl(url) {
  try {
    const parsed = new URL(url ?? "");
    return slugText(parsed.searchParams.get("location"));
  } catch {
    return "";
  }
}

function isTopLevelDiscoveredMenuPage(link) {
  try {
    const pathname = new URL(link?.url ?? "").pathname.replace(/\/+$/g, "");

    return (
      /menu/i.test(pathname) &&
      (!/^\/menus\//i.test(pathname) ||
        Boolean(menuLocationScopeFromUrl(link?.url)))
    );
  } catch {
    return false;
  }
}

function menuLocationScopeFromUrl(url) {
  let pathname = "";

  try {
    pathname = new URL(url ?? "").pathname;
  } catch {
    return "";
  }

  const segments = pathname
    .split("/")
    .map((segment) => slugText(segment))
    .filter(Boolean);

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const next = segments[index + 1] ?? "";

    if (!next) {
      continue;
    }

    if (
      /^(?:menus?|locations?-menus?|location-menus?)$/.test(segment) &&
      isLocationScopedMenuSegment(next)
    ) {
      return next;
    }
  }

  return "";
}

function isLocationScopedMenuSegment(segment) {
  if (!segment || /^(?:menu|menus?)$/.test(segment)) {
    return false;
  }

  if (/\bwashington-(?:st|street)\b/i.test(segment)) {
    return false;
  }

  if (
    /^(?:all|breakfast|brunch|lunch|dinner|desserts?|kids?|happy-hour|food|main|mains?|takeout|take-out|to-go|beverages?|drinks?|cocktails?|wine|beer|catering|nutrition|allergens?|ingredients?|specials?|seasonal|limited-time|events?)$/.test(
      segment,
    )
  ) {
    return false;
  }

  return (
    hasKnownStateSuffix(segment) ||
    /\b(?:dc|md|va|ct|ny|nj|pa|de|fl|ca|co|ga|il|in|ma|mi|nc|nv|oh|tn|tx|wa)\b/.test(
      segment,
    ) ||
    /\b(?:alexandria|annandale|arlington|ashburn|bethesda|boston|brookfield|centreville|chantilly|chicago|college-park|columbus|dallas|denver|fairfax|falls-church|gaithersburg|glastonbury|herndon|hyattsville|indianapolis|kansas-city|laurel|las-vegas|manassas|mclean|miami|naples|nashville|national-harbor|north-arlington|palm-beach|reston|rockville|silver-spring|springfield|sterling|takoma-park|tysons|waldorf|washington|woodbridge)\b/.test(
      segment,
    )
  );
}

function hasKnownStateSuffix(value) {
  return /-(?:dc|md|va|ct|ny|nj|pa|de|fl|ca|co|ga|il|in|ma|mi|nc|nv|oh|tn|tx|wa)(?:-\d+)?$/i.test(
    String(value ?? ""),
  );
}

function sourceLocationTokens(source) {
  const rawTokens = [
    source?.city,
    source?.region,
    source?.locationId,
    sourceNameLocationSuffix(source?.name),
    source?.displayAddress,
    source?.address?.city,
    source?.address?.region,
    source?.address?.displayAddress,
  ];

  if (
    /^(?:washington|dc)$/i.test(`${source?.city ?? ""}`) ||
    /^DC$/i.test(`${source?.region ?? ""}`)
  ) {
    rawTokens.push("dc", "washington", "district of columbia");
  }

  return Array.from(
    new Set(
      rawTokens
        .flatMap((value) => slugText(value).split("-"))
        .filter((token) => token.length >= 3 || token === "dc")
        .concat(
          rawTokens
            .map(slugText)
            .filter((token) => token.length >= 3 || token === "dc"),
        ),
    ),
  );
}

function sourceNameLocationSuffix(name) {
  const text = cleanText(name);

  if (!text || !/[-|–—]/.test(text)) {
    return "";
  }

  const suffix = cleanText(text.split(/\s[-|–—]\s|\|/).at(-1));

  if (!suffix || suffix === text || suffix.split(/\s+/).length > 5) {
    return "";
  }

  return suffix;
}

function slugText(value) {
  return slugify(cleanText(value) ?? "", {
    lower: true,
    strict: true,
  });
}

function extractLocationPageLinks($, url) {
  const links = [];
  const current = stripHashFromUrl(url);
  let currentPathname = "";

  try {
    currentPathname = new URL(url).pathname;
  } catch {
    currentPathname = "";
  }

  if (
    /\/(?:locations?|menus?[^/]*|nutrition[^/]*|allergens?[^/]*|ingredients?[^/]*|loyalty|rewards?)(?:\/|$)/i.test(
      currentPathname,
    )
  ) {
    return [];
  }

  $("a[href]").each((_index, element) => {
    const href = absolutizeUrl($(element).attr("href"), url);
    const text =
      cleanText($(element).text()) ??
      cleanText($(element).attr("aria-label")) ??
      "";

    if (!href || !isSameSite(href, url)) {
      return;
    }

    if (
      stripHashFromUrl(href) === current ||
      /\.(?:pdf|xlsx?|csv|jpe?g|png|webp|gif|svg)(?:[?#]|$)/i.test(href)
    ) {
      return;
    }

    let pathname;

    try {
      pathname = new URL(href).pathname;
    } catch {
      return;
    }

    if (!/\/locations?\//i.test(pathname)) {
      return;
    }

    const haystack = `${href} ${text}`;

    if (
      /\b(?:careers?|jobs?|gift\s*card|privacy|terms|contact|events?|catering|reservations?)\b/i.test(
        haystack,
      )
    ) {
      return;
    }

    links.push({ label: text, url: href });
  });

  return uniqueBy(links, (link) => stripHashFromUrl(link.url)).slice(0, 10);
}

function extractApiLinks($, url, restaurant = null) {
  const links = [];

  const oloVendorApiUrl = oloVendorApiUrlForMenuUrl(url);

  if (oloVendorApiUrl) {
    links.push({ label: "Olo vendor menu API", url: oloVendorApiUrl });
  }

  $("a[href]").each((_index, element) => {
    const href = absolutizeUrl($(element).attr("href"), url);
    const apiUrl = oloVendorApiUrlForMenuUrl(href);

    if (apiUrl) {
      links.push({
        label: cleanText($(element).text()) ?? "Olo vendor menu API",
        url: apiUrl,
      });
    }
  });

  $("meta[property='mmd']").each((_index, element) => {
    const $element = $(element);
    const baseUrl =
      $element.attr("data-baseUrl") ?? $element.attr("data-baseurl") ?? url;

    for (const attr of ["data-allergens", "data-ingredients"]) {
      const href = absolutizeUrl($element.attr(attr), baseUrl);

      if (href) {
        links.push({ label: attr, url: href });
      }
    }
  });

  links.push(...extractSquareOnlineApiLinks($, url));
  links.push(...extractMenuSifuApiLinks($, url));
  links.push(...extractSpotAppsApiLinks($, url));
  links.push(...extractHeartlandApiLinks($, url, restaurant));
  links.push(...extractWixRestaurantMenuAccessTokenLinks($, url));
  links.push(...extractLunchboxNovaBundleLinks($, url));
  links.push(...extractDardenPlatformApiLinks($, url));
  links.push(...extractIMenuProScriptLinks($, url));

  return uniqueBy(links, (link) => normalizeUrl(link.url)).slice(0, 12);
}

function extractIMenuProScriptLinks($, url) {
  const links = [];

  $("script[src]").each((_index, element) => {
    const href = absolutizeUrl($(element).attr("src"), url);

    if (!href || !/^https?:\/\/(?:www\.)?imenupro\.com\/!/i.test(href)) {
      return;
    }

    links.push({
      label: "iMenuPro embedded menu",
      referer: url,
      role: "imenupro-menu-script",
      url: href,
    });
  });

  return links;
}

function extractLunchboxNovaBundleLinks($, url) {
  const links = [];
  const html = $.html() ?? "";

  if (!/lunchbox-storefront|lunchbox|novadine/i.test(html)) {
    return [];
  }

  $("script[src]").each((_index, element) => {
    const src = $(element).attr("src");
    const href = absolutizeUrl(src, url);

    if (!href || !/\/js\/app\.[a-z0-9]+\.js(?:[?#]|$)/i.test(href)) {
      return;
    }

    const storeId = lunchboxStoreIdFromUrl(url);

    links.push({
      label: "Lunchbox storefront app bundle",
      referer: url,
      role: "lunchbox-nova-app-bundle",
      storeId,
      url: href,
    });
  });

  return uniqueBy(links, (link) => normalizeUrl(link.url)).slice(0, 4);
}

function extractLunchboxNovaMenuApiLinksFromBundle(
  text,
  _restaurant,
  url,
  queueEntry = null,
) {
  if (queueEntry?.role !== "lunchbox-nova-app-bundle") {
    return [];
  }

  const baseUrl = lunchboxNovaApiBaseFromBundle(text);
  const apiKey = lunchboxNovaApiKeyFromBundle(text);
  const storeId =
    queueEntry.storeId ?? lunchboxStoreIdFromUrl(queueEntry.referer ?? url);

  if (!baseUrl || !apiKey) {
    return [];
  }

  const referer = queueEntry.referer ?? url;
  const headers = lunchboxNovaHeaders(apiKey, referer);

  if (!storeId && _restaurant?.city) {
    const lookupUrl = new URL(`${baseUrl.replace(/\/+$/g, "")}/stores`);
    lookupUrl.searchParams.set("city", _restaurant.city);

    return [
      {
        apiKey,
        fetchOptions: { extraHeaders: headers },
        label: "Lunchbox Nova store lookup",
        referer,
        role: "lunchbox-nova-store-lookup",
        url: lookupUrl.toString(),
      },
    ];
  }

  if (!storeId) {
    return [];
  }

  const apiUrl = `${baseUrl.replace(/\/+$/g, "")}/stores/${encodeURIComponent(storeId)}/menus`;

  return [
    {
      fetchOptions: { extraHeaders: headers },
      label: "Lunchbox Nova menu API",
      referer,
      role: "lunchbox-nova-menu-api",
      url: apiUrl,
    },
  ];
}

function extractLunchboxNovaMenuApiLinksFromStoreLookup(
  text,
  restaurant,
  url,
  queueEntry = null,
) {
  if (queueEntry?.role !== "lunchbox-nova-store-lookup") {
    return [];
  }

  const parsed = parseJsonLoose(text);
  const stores = Array.isArray(parsed) ? parsed : asArray(parsed?.data);
  const store = pickLunchboxNovaStore(stores, restaurant);
  const apiKey =
    queueEntry.apiKey ?? queueEntry.fetchOptions?.extraHeaders?.["ND-API-Key"];

  if (!store?.store_id || !apiKey) {
    return [];
  }

  const baseUrl = lunchboxNovaBaseUrlFromApiUrl(url);
  const referer = queueEntry.referer ?? url;

  if (!baseUrl) {
    return [];
  }

  return [
    {
      fetchOptions: { extraHeaders: lunchboxNovaHeaders(apiKey, referer) },
      label: "Lunchbox Nova menu API",
      referer,
      role: "lunchbox-nova-menu-api",
      storeId: String(store.store_id),
      url: `${baseUrl}/stores/${encodeURIComponent(String(store.store_id))}/menus`,
    },
  ];
}

function lunchboxNovaHeaders(apiKey, referer) {
  const origin = originForUrl(referer);

  return {
    Accept: "application/json",
    "ND-API-Key": apiKey,
    Referer: referer,
    ...(origin ? { Origin: origin } : {}),
  };
}

function pickLunchboxNovaStore(stores, restaurant) {
  const candidates = asArray(stores);

  if (candidates.length === 0) {
    return null;
  }

  const sourceTokens = lunchboxNovaSourceTokens(restaurant);
  const scored = candidates
    .map((store) => {
      const haystack = slugText(
        [
          store?.name,
          store?.address1,
          store?.address2,
          store?.address3,
          store?.city,
          store?.state,
          store?.postal_code,
        ]
          .filter(Boolean)
          .join(" "),
      );
      const score = sourceTokens.filter(
        (token) => token.length >= 3 && haystack.includes(token),
      ).length;

      return { score, store };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.score > 0 ? scored[0].store : candidates[0];
}

function lunchboxNovaSourceTokens(restaurant) {
  const tokens = new Set(sourceLocationTokens(restaurant));

  for (const url of [
    ...asArray(restaurant?.menuUrls),
    ...asArray(restaurant?.allergenUrls),
    ...asArray(restaurant?.apiUrls),
  ]) {
    try {
      const parsed = new URL(typeof url === "string" ? url : url?.url);

      for (const part of parsed.pathname.split("/")) {
        const token = slugText(part);

        if (
          token &&
          token.length >= 3 &&
          !/^(?:locations?|menus?|order|online|pickup|delivery|restaurant)$/.test(
            token,
          )
        ) {
          tokens.add(token);
        }
      }
    } catch {
      // Ignore malformed source URLs.
    }
  }

  return [...tokens];
}

function lunchboxNovaBaseUrlFromApiUrl(url) {
  try {
    const parsed = new URL(url);
    const match = /^(\/api\/v\d+)\//i.exec(parsed.pathname);
    return match ? `${parsed.origin}${match[1]}` : null;
  } catch {
    return null;
  }
}

function lunchboxNovaApiBaseFromBundle(text) {
  const matches = [
    ...String(text ?? "").matchAll(
      /https:\/\/[a-z0-9.-]+\.novadine\.com\/api\/v\d+/gi,
    ),
  ];
  return matches[0]?.[0] ?? null;
}

function lunchboxNovaApiKeyFromBundle(text) {
  const candidates = [
    ...String(text ?? "").matchAll(
      /["']([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})["']/gi,
    ),
  ]
    .map((match) => match[1])
    .filter(
      (value) =>
        value && !/^00000000-0000-0000-0000-000000000000$/i.test(value),
    );

  return candidates[0] ?? null;
}

function lunchboxStoreIdFromUrl(url) {
  try {
    const parsed = new URL(url);
    const match = /^\/(\d+)(?:\/|$)/.exec(parsed.pathname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function originForUrl(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function extractDardenPlatformApiLinks($, url) {
  const conceptCode = dardenPlatformConceptCodeForUrl(url);

  if (!conceptCode) {
    return [];
  }

  const restaurantNumbers = new Set();
  const texts = [url, $.html() ?? ""];

  $("a[href], script[src]").each((_index, element) => {
    texts.push($(element).attr("href") ?? "");
    texts.push($(element).attr("src") ?? "");
  });

  for (const rawText of texts) {
    const text = decodeHtml(String(rawText ?? "").replace(/\\\//g, "/"));
    let match;
    const locationPattern =
      /\/locations\/[^"'<>\s?#]+\/(\d{3,8})(?:[?#][^"'<>\s]*)?/gi;
    const restaurantNumberPattern =
      /\brestaurantNum(?:ber)?["']?\s*[:=]\s*["']?(\d{3,8})\b/gi;

    while ((match = locationPattern.exec(text))) {
      restaurantNumbers.add(match[1]);
    }

    while ((match = restaurantNumberPattern.exec(text))) {
      restaurantNumbers.add(match[1]);
    }
  }

  let origin;

  try {
    origin = new URL(url).origin;
  } catch {
    return [];
  }

  return [...restaurantNumbers].map((restaurantNumber) => {
    const apiUrl = new URL("/api/menu", origin);
    apiUrl.searchParams.set("restaurantNum", restaurantNumber);

    return {
      fetchOptions: {
        extraHeaders: {
          Accept: "application/json",
          Referer: url,
          "X-Concept-Code": conceptCode,
        },
      },
      label: "Darden platform menu API",
      referer: url,
      role: "hosted-menu-api",
      url: apiUrl.toString(),
    };
  });
}

function dardenPlatformConceptCodeForUrl(url) {
  let hostname;

  try {
    hostname = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }

  const conceptCodes = {
    "eddiev.com": "EDDIEVS",
    "thecapitalburger.com": "CAPITALBURGER",
  };

  return conceptCodes[hostname] ?? null;
}

function isDardenPlatformUrl(url) {
  return Boolean(dardenPlatformConceptCodeForUrl(url));
}

function extractWixRestaurantMenuAccessTokenLinks($, url) {
  const html = $.html() ?? "";

  if (
    !html.includes(wixRestaurantMenusAppDefinitionId) ||
    !/restaurants-menus-menu|restaurant-menus-showcase/i.test(html)
  ) {
    return [];
  }

  const accessTokensUrl =
    pickString(parseWixEssentialViewerModel($)?.accessTokensUrl) ??
    absolutizeUrl("/_api/v1/access-tokens", url);

  if (!accessTokensUrl) {
    return [];
  }

  return [
    {
      label: "Wix restaurant menu access tokens",
      referer: url,
      role: "wix-restaurant-menu-access-tokens",
      url: accessTokensUrl,
    },
  ];
}

function parseWixEssentialViewerModel($) {
  const text = $("#wix-essential-viewer-model").text();

  if (!text) {
    return null;
  }

  return parseJsonLoose(text);
}

function extractHeartlandApiLinks($, url, restaurant = null) {
  const domains = new Set();
  const texts = [url, $.html() ?? ""];

  $("a[href], iframe[src], script[src]").each((_index, element) => {
    texts.push($(element).attr("href") ?? "");
    texts.push($(element).attr("src") ?? "");
  });

  for (const rawText of texts) {
    const text = decodeHtml(String(rawText ?? "").replace(/\\\//g, "/"));
    let match;
    const heartlandHostPattern =
      /https?:\/\/([a-z0-9-]+)\.hrpos\.heartland\.us\/menu\b[^"'<>\s]*/gi;
    const mobileBytesPattern =
      /["'`](?:https?:\/\/)?([a-z0-9-]+\.mobilebytes\.com)["'`]/gi;

    while ((match = heartlandHostPattern.exec(text))) {
      domains.add(`${match[1]}.mobilebytes.com`);
    }

    while ((match = mobileBytesPattern.exec(text))) {
      domains.add(match[1]);
    }
  }

  const scopedDomains = scopeHeartlandDomainsToRestaurant(
    [...domains],
    restaurant,
  );

  return scopedDomains.map((domain) => {
    const body = {
      domain,
      locationId: 0,
      orderMethod: 3,
      orderType: 1,
    };
    const params = new URLSearchParams({ domain });

    return {
      fetchOptions: {
        body: JSON.stringify(body),
        extraHeaders: {
          Accept: "application/json",
          "content-type": "application/json",
          Origin: "https://online.hrpos.heartland.us",
          Referer: "https://online.hrpos.heartland.us/",
        },
        method: "POST",
      },
      label: "Heartland hosted menu API",
      role: "hosted-menu-api",
      url: `https://online.hrpos.heartland.us/initial_data?${params.toString()}`,
    };
  });
}

function scopeHeartlandDomainsToRestaurant(domains, restaurant) {
  if (domains.length <= 1 || !restaurant) {
    return domains;
  }

  const scored = domains.map((domain) => ({
    domain,
    score: scoreHeartlandDomainForRestaurant(domain, restaurant),
  }));
  const matches = scored.filter((entry) => entry.score > 0);

  return matches.length > 0
    ? matches.sort((a, b) => b.score - a.score).map((entry) => entry.domain)
    : domains;
}

function scoreHeartlandDomainForRestaurant(domain, restaurant) {
  const domainText = normalizeMenuName(domain);
  const tokens = uniqueStrings([
    ...String(restaurant.locationId ?? "").split(/[^a-z0-9]+/i),
    ...String(restaurant.city ?? "").split(/[^a-z0-9]+/i),
    ...String(restaurant.displayAddress ?? "").split(/[^a-z0-9]+/i),
  ])
    .map((token) => normalizeMenuName(token))
    .filter(
      (token) =>
        token &&
        token.length >= 4 &&
        !/^(?:metro|county|washington|restaurant)$/i.test(token),
    );

  return tokens.reduce(
    (score, token) => score + (domainText.includes(token) ? 1 : 0),
    0,
  );
}

function extractSpotAppsApiLinks($, url) {
  const ids = new Set();
  const texts = [url, $.html() ?? ""];

  $("a[href], iframe[src], script[src]").each((_index, element) => {
    texts.push($(element).attr("href") ?? "");
    texts.push($(element).attr("src") ?? "");
  });

  for (const rawText of texts) {
    const text = decodeHtml(String(rawText ?? "").replace(/\\\//g, "/"));
    let match;
    const spotIdPattern = /(?:[?&]|\b)spot_id=?(\d{4,})\b/gi;
    const orderingMenuPattern =
      /tmt\.spotapps\.co\/ordering-menu\/?[^"'<>\s]*/gi;

    while ((match = spotIdPattern.exec(text))) {
      ids.add(match[1]);
    }

    while ((match = orderingMenuPattern.exec(text))) {
      try {
        const parsed = new URL(
          match[0].startsWith("http") ? match[0] : `https://${match[0]}`,
        );
        const spotId = parsed.searchParams.get("spot_id");

        if (spotId) {
          ids.add(spotId);
        }
      } catch {
        // Ignore malformed embed references; explicit spot_id matches above still work.
      }
    }
  }

  return [...ids].map((id) => ({
    label: "SpotApps ordering menu",
    url: `https://tmt.spotapps.co/ordering-menu/?spot_id=${encodeURIComponent(id)}`,
  }));
}

function extractMenuSifuApiLinks($, url) {
  const ids = new Set();
  const texts = [url, $.html() ?? ""];

  $("a[href], iframe[src]").each((_index, element) => {
    texts.push($(element).attr("href") ?? "");
    texts.push($(element).attr("src") ?? "");
  });

  for (const rawText of texts) {
    const text = decodeHtml(String(rawText ?? "").replace(/\\\//g, "/"));
    let match;
    const merchantPattern =
      /order\.mealkeyway\.com\/merchant\/([a-z0-9]{20,})/gi;
    const midPattern = /[?&]mid=([a-z0-9]{20,})/gi;

    while ((match = merchantPattern.exec(text))) {
      ids.add(match[1]);
    }

    while ((match = midPattern.exec(text))) {
      ids.add(match[1]);
    }
  }

  return [...ids].map((id) => ({
    label: "MenuSifu menu API",
    url: `https://order.mealkeyway.com/merchant/${encodeURIComponent(id)}/menu?productLine=ONLINE_ORDER`,
  }));
}

function extractSquareOnlineApiLinks($, url) {
  const links = [];
  const pageSignals = [
    $("meta[name='generator']").attr("content"),
    $("script[src*='editmysite.com']").attr("src"),
    url,
  ]
    .filter(Boolean)
    .join(" ");

  if (!/square online|editmysite|square\.site/i.test(pageSignals)) {
    return links;
  }

  $("script").each((_index, element) => {
    const text = $(element).contents().text();

    if (!text?.includes("window.__BOOTSTRAP_STATE__")) {
      return;
    }

    const parsed = parseSquareOnlineBootstrapState(text);

    if (!parsed) {
      return;
    }

    const userId =
      squareOnlineId(parsed?.siteData?.user?.id) ??
      squareOnlineId(parsed?.user?.id);
    const siteId =
      squareOnlineId(parsed?.siteData?.site?.properties?.classicSiteID) ??
      squareOnlineId(parsed?.siteData?.site?.properties?.classicSiteId) ??
      squareOnlineId(parsed?.siteData?.site?.id);

    if (!userId || !siteId) {
      return;
    }

    try {
      const origin = new URL(url).origin;
      const apiUrl = `${origin}/app/store/api/v28/editor/users/${encodeURIComponent(userId)}/sites/${encodeURIComponent(
        siteId,
      )}/products?page=1&per_page=200&include=images,media_files,discounts`;
      links.push({ label: "Square Online product API", url: apiUrl });
    } catch {
      // Ignore malformed source URLs; other extractors can still handle the page.
    }
  });

  return links;
}

function parseSquareOnlineBootstrapState(text) {
  const markerIndex = text.indexOf("window.__BOOTSTRAP_STATE__");

  if (markerIndex < 0) {
    return null;
  }

  const equalsIndex = text.indexOf("=", markerIndex);
  const objectStart = text.indexOf("{", equalsIndex);

  if (equalsIndex < 0 || objectStart < 0) {
    return null;
  }

  const objectEnd = findMatchingBracket(text, objectStart, "{", "}");

  if (objectEnd < 0) {
    return null;
  }

  return parseJsonLoose(text.slice(objectStart, objectEnd + 1));
}

function squareOnlineId(value) {
  if (typeof value === "string" || typeof value === "number") {
    const id = String(value).trim();
    return id.length > 0 ? id : null;
  }

  return null;
}

function oloVendorApiUrlForMenuUrl(url) {
  try {
    const parsed = new URL(url);

    if (/(^|\.)toasttab\.com$/i.test(parsed.hostname)) {
      return null;
    }

    const match = parsed.pathname.match(/\/menu\/([^/?#]+)/i);

    if (!match || !/\.olo\.com$|(^|\.)order\./i.test(parsed.hostname)) {
      return null;
    }

    const haystack = `${parsed.hostname} ${parsed.pathname}`;

    if (
      /\b(?:catering|private[-_/ ]?events?|event[-_/ ]?menu|banquet)\b/i.test(
        haystack,
      )
    ) {
      return null;
    }

    return `${parsed.origin}/api/vendors/${match[1]}`;
  } catch {
    return null;
  }
}

function platformHeadersForUrl(url) {
  if (!/\/api\/vendors\/[^/?#]+/i.test(url ?? "")) {
    return {};
  }

  return {
    accept: "application/json",
    "content-type": "application/json",
    "x-olo-app-platform": "web",
    "x-olo-request": "1",
    "x-olo-serve-next-request": "1",
  };
}

export function mergeRecords(records) {
  const byName = new Map();

  for (const record of records) {
    const key =
      /^new g$/i.test(cleanMenuName(record.name) ?? "") &&
      /^pies$/i.test(record.category ?? "")
        ? "new-g"
        : similarityKey(record.name);

    if (!key || key.length < 2) {
      continue;
    }

    const current = byName.get(key);

    if (!current) {
      byName.set(key, normalizeRecord(record));
      continue;
    }

    const next = normalizeRecord(record);
    const nextPriority = itemSourcePriority[next.sourceKind] ?? 0;
    const currentPriority = itemSourcePriority[current.sourceKind] ?? 0;
    const protectCurrentOfficialSection =
      areOfficialAllergenRows(current, next) &&
      hasConflictingSpecificCategories(current.category, next.category);

    const authoritativeOfficialMerge = mergeAuthoritativeOfficialAllergenRecord(
      current,
      next,
    );

    if (authoritativeOfficialMerge) {
      byName.set(key, authoritativeOfficialMerge);
      continue;
    }

    if (protectCurrentOfficialSection) {
      byName.set(key, {
        ...current,
        evidence: uniqueEvidence([...current.evidence, ...next.evidence]),
        officialAllergenCoveredIds: uniqueStrings([
          ...(current.officialAllergenCoveredIds ?? []),
          ...(next.officialAllergenCoveredIds ?? []),
        ]),
        sourceUrls: publishableSourceUrls([
          ...current.sourceUrls,
          ...next.sourceUrls,
        ]),
      });
      continue;
    }

    byName.set(key, {
      ...current,
      allergens: uniqueStrings([...current.allergens, ...next.allergens]),
      officialAllergenCoveredIds: uniqueStrings([
        ...(current.officialAllergenCoveredIds ?? []),
        ...(next.officialAllergenCoveredIds ?? []),
      ]),
      allergenSourceType:
        (allergenSourcePriority[next.allergenSourceType] ?? 0) >
        (allergenSourcePriority[current.allergenSourceType] ?? 0)
          ? next.allergenSourceType
          : current.allergenSourceType,
      category: chooseMergedCategory(
        current.category,
        next.category,
        currentPriority,
        nextPriority,
      ),
      description: pickBestDescription(current.description, next.description),
      evidence: uniqueEvidence([...current.evidence, ...next.evidence]),
      imageUrl: current.imageUrl ?? next.imageUrl,
      ingredientsText: pickBestDescription(
        current.ingredientsText,
        next.ingredientsText,
      ),
      isConfigurable: current.isConfigurable || next.isConfigurable,
      mayContain: uniqueStrings([...current.mayContain, ...next.mayContain]),
      nutritionFacts: current.nutritionFacts ?? next.nutritionFacts,
      sourceKind:
        nextPriority > currentPriority ? next.sourceKind : current.sourceKind,
      sourceUrls: publishableSourceUrls([
        ...current.sourceUrls,
        ...next.sourceUrls,
      ]),
      variantGroup: current.variantGroup ?? next.variantGroup,
    });
  }

  return Array.from(byName.values())
    .map((item) => ({
      id: slugify(item.name, { lower: true, strict: true }),
      name: item.name,
      category: pfChangsKnownCategoryForName(item) ?? item.category,
      description: item.description,
      imageUrl: item.imageUrl,
      ingredientsText: item.ingredientsText,
      nutritionFacts: item.nutritionFacts,
      isConfigurable: item.isConfigurable,
      allergenSourceType: item.allergenSourceType,
      allergens: item.allergens,
      ...(item.officialAllergenCoveredIds?.length
        ? { officialAllergenCoveredIds: item.officialAllergenCoveredIds }
        : {}),
      mayContain: item.mayContain,
      sourceType: item.sourceKind,
      sourceUrls: publishableSourceUrls(item.sourceUrls),
      variantGroup: item.variantGroup,
      evidence: item.evidence.slice(0, 5),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function mergeAuthoritativeOfficialAllergenRecord(current, next) {
  const currentAuthoritative = isRowLevelOfficialAllergenMatrixRecord(current);
  const nextAuthoritative = isRowLevelOfficialAllergenMatrixRecord(next);
  const currentWeakNutritionix = isWeakNutritionixSupplementRecord(current);
  const nextWeakNutritionix = isWeakNutritionixSupplementRecord(next);

  if (currentAuthoritative && nextWeakNutritionix) {
    return mergeOfficialAllergenRecordWithSupplement(current, next);
  }

  if (nextAuthoritative && currentWeakNutritionix) {
    return mergeOfficialAllergenRecordWithSupplement(next, current);
  }

  return null;
}

function mergeOfficialAllergenRecordWithSupplement(authoritative, supplement) {
  const authoritativePriority =
    itemSourcePriority[authoritative.sourceKind] ?? 0;
  const supplementPriority = itemSourcePriority[supplement.sourceKind] ?? 0;

  return {
    ...authoritative,
    category: chooseMergedCategory(
      authoritative.category,
      supplement.category,
      authoritativePriority,
      supplementPriority,
    ),
    description: pickBestDescription(
      authoritative.description,
      supplement.description,
    ),
    evidence: uniqueEvidence([
      ...authoritative.evidence,
      ...supplement.evidence,
    ]),
    imageUrl: authoritative.imageUrl ?? supplement.imageUrl,
    ingredientsText: pickBestDescription(
      authoritative.ingredientsText,
      supplement.ingredientsText,
    ),
    isConfigurable: authoritative.isConfigurable || supplement.isConfigurable,
    nutritionFacts: authoritative.nutritionFacts ?? supplement.nutritionFacts,
    sourceUrls: publishableSourceUrls([
      ...authoritative.sourceUrls,
      ...supplement.sourceUrls,
    ]),
    variantGroup: authoritative.variantGroup ?? supplement.variantGroup,
  };
}

function isRowLevelOfficialAllergenMatrixRecord(record) {
  return (
    record?.allergenSourceType === allergenSourceTypes.officialAllergenMenu &&
    [
      "embedded-flavor-nutrition",
      "html-allergen-matrix",
      "pdf-matrix",
    ].includes(record?.sourceKind) &&
    ((record?.allergens ?? []).length > 0 ||
      (record?.mayContain ?? []).length > 0)
  );
}

function isWeakNutritionixSupplementRecord(record) {
  const sourceText = [
    record?.sourceKind,
    ...(record?.sourceUrls ?? []),
    ...(record?.evidence ?? []).flatMap((entry) => [
      entry?.sourceKind,
      entry?.sourceUrl,
      entry?.text,
    ]),
    record?.description,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    record?.sourceKind === "official-api" &&
    /nutritionix\.com/i.test(sourceText) &&
    !hasRowLevelAllergenEvidence(record)
  );
}

function hasRowLevelAllergenEvidence(record) {
  return (record?.evidence ?? []).some((entry) =>
    /\b(?:contains?|allergen matrix row|allergen statement|may contain)\b/i.test(
      `${entry?.text ?? ""}`,
    ),
  );
}

function chooseMergedCategory(
  currentCategory,
  nextCategory,
  currentPriority,
  nextPriority,
) {
  if (!nextCategory || nextCategory === "Menu") {
    return currentCategory;
  }

  if (!currentCategory || currentCategory === "Menu") {
    return nextCategory;
  }

  if (
    isGenericRestaurantCuisineCategory(currentCategory) &&
    !isGenericRestaurantCuisineCategory(nextCategory)
  ) {
    return nextCategory;
  }

  if (
    isGenericRestaurantCuisineCategory(nextCategory) &&
    !isGenericRestaurantCuisineCategory(currentCategory)
  ) {
    return currentCategory;
  }

  return nextPriority > currentPriority ? nextCategory : currentCategory;
}

function isGenericRestaurantCuisineCategory(category) {
  return /^(?:asian|american|restaurant|food|menu|items|cuisine)$/i.test(
    String(category ?? "").trim(),
  );
}

function areOfficialAllergenRows(current, next) {
  return (
    current?.allergenSourceType === allergenSourceTypes.officialAllergenMenu &&
    next?.allergenSourceType === allergenSourceTypes.officialAllergenMenu
  );
}

function hasConflictingSpecificCategories(currentCategory, nextCategory) {
  const current = String(currentCategory ?? "").trim();
  const next = String(nextCategory ?? "").trim();

  if (!current || !next || current === "Menu" || next === "Menu") {
    return false;
  }

  if (similarityKey(current) === similarityKey(next)) {
    return false;
  }

  return (
    !isGenericRestaurantCuisineCategory(current) &&
    !isGenericRestaurantCuisineCategory(next)
  );
}

export function normalizeRecord(record) {
  const name = cleanMenuName(record.name);
  const category = normalizeRecordCategory(
    pfChangsKnownCategoryForName(record) ?? record.category,
  );
  const explicitDescriptionDisclosure =
    officialMenuDescriptionDisclosure(record);
  const allergenSourceType =
    explicitDescriptionDisclosure?.allergenSourceType ??
    record.allergenSourceType ??
    allergenSourceTypes.unavailable;
  const allergens =
    explicitDescriptionDisclosure?.allergens ?? record.allergens ?? [];
  const mayContain = uniqueStrings([
    ...(record.mayContain ?? []),
    ...(explicitDescriptionDisclosure?.mayContain ?? []),
  ]);
  const evidenceText =
    explicitDescriptionDisclosure?.evidenceText ??
    record.evidenceText ??
    record.description ??
    record.name;

  return {
    allergens: uniqueStrings(allergens),
    allergenSourceType,
    officialAllergenCoveredIds: uniqueStrings(
      record.officialAllergenCoveredIds ?? [],
    ),
    category:
      similarityKey(category) === similarityKey(name) ? "Menu" : category,
    description: cleanText(record.description),
    evidence: uniqueEvidence(
      record.evidence ?? [
        {
          sourceKind: record.sourceKind,
          sourceUrl: record.sourceUrl,
          text: cleanText(evidenceText),
        },
      ],
    ),
    imageUrl: record.imageUrl ?? null,
    ingredientsText: cleanText(record.ingredientsText),
    isConfigurable: Boolean(record.isConfigurable),
    mayContain,
    name,
    nutritionFacts: normalizeNutritionFacts(record.nutritionFacts),
    sourceKind: record.sourceKind,
    sourceUrls: publishableSourceUrls([record.sourceUrl]),
    variantGroup: cleanText(record.variantGroup),
  };
}

function pfChangsKnownCategoryForName(record) {
  const evidenceSourceUrls = Array.isArray(record?.evidence)
    ? record.evidence.map((entry) => entry?.sourceUrl).filter(Boolean)
    : [];
  const sourceHaystack = [
    record?.sourceUrl,
    ...(Array.isArray(record?.sourceUrls) ? record.sourceUrls : []),
    ...evidenceSourceUrls,
  ].join(" ");

  if (!/pfchangs\.com/i.test(sourceHaystack)) {
    return null;
  }

  const key = similarityKey(record?.name);
  const categories = {
    "black-pepper-filet": "Beef",
    "butter-cake": "Desserts",
    "california-hand-roll": "Sushi",
    "crispy-eggplant": "Appetizers",
    "flaming-red-wontons": "Appetizers",
    "gf-fried-rice-tofu": "Gluten-Free Noodles & Rice",
    "hong-kong-beef": "Beef",
    "japanese-philly-roll": "Sushi",
    "japanese-wok-fired-calamari": "Appetizers",
    "kid-s-california-roll": "Kids Menu",
    "kid-s-honey-chicken": "Kids Menu",
    "korean-sesame-chicken": "Chicken",
    "lobster-prawn-fried-rice": "Noodles & Rice",
    "longlife-noodles-prawns": "Noodles & Rice",
    "ny-prime-strip-steak-tataki": "Beef",
    "oolong-chilean-seabass": "Seafood",
    "pork-belly-bao-buns": "Appetizers",
    "shrimp-dumplings-pan-fried-6": "Dim Sum",
    "shrimp-tempura-hand-roll": "Sushi",
    "spicy-tuna-crispy-rice": "Sushi",
    "spicy-tuna-hand-roll": "Sushi",
    "stir-fried-eggplant": "Vegetarian",
    "tiger-roll": "Sushi",
    "vegetable-spring-rolls": "Dim Sum",
    "veggie-lettuce-wraps": "Appetizers",
  };

  return categories[key] ?? null;
}

function officialMenuDescriptionDisclosure(record) {
  if (
    !record ||
    record.allergenSourceType !== allergenSourceTypes.unavailable ||
    (record.allergens ?? []).length > 0 ||
    (record.mayContain ?? []).length > 0
  ) {
    return null;
  }

  if (!isOfficialRestaurantMenuSourceUrl(record.sourceUrl)) {
    return null;
  }

  const description = cleanText(record.description);

  if (!description) {
    return null;
  }

  const directAllergens = findDeclaredAllergensOnly(description);
  const ingredientAllergens = findOfficialIngredientListAllergens(description);
  const mayContain = findMayContainAllergens(description);
  const allergens = uniqueStrings([...directAllergens, ...ingredientAllergens]);

  if (allergens.length === 0 && mayContain.length === 0) {
    return null;
  }

  return {
    allergenSourceType: allergenSourceTypes.officialIngredients,
    allergens,
    mayContain,
    evidenceText: description,
  };
}

function isOfficialRestaurantMenuSourceUrl(url) {
  if (!url || isThirdPartyMarketplaceUrl(url)) {
    return false;
  }

  try {
    const host = new URL(url).hostname.replace(/^www\./i, "");

    return !/^(?:toasttab|square|spoton|menupix|restaurantji|allmenus|sirved|tripadvisor|yelp)\.com$/i.test(
      host,
    );
  } catch {
    return false;
  }
}

function normalizeRecordCategory(value) {
  const category = cleanText(value);

  if (
    !category ||
    /^calories$/i.test(category) ||
    /^menus?\s+[a-z]{2,4}\s+q\d+\s+dining$/i.test(category) ||
    /^nutritional information$/i.test(category) ||
    /^washington\s+d\.?c\.?\s+.+\s+allergy$/i.test(category) ||
    /^\d{5,}$/.test(category) ||
    /^item\s+[a-f0-9-]{12,}$/i.test(category) ||
    /^item\b.+\b[a-f0-9]{8}(?:[-\s][a-f0-9]{4}){1,}/i.test(category)
  ) {
    return "Menu";
  }

  if (/^bringing melbourne'?s renowned coffee culture\b/i.test(category)) {
    return "Coffee";
  }

  if (/^healthy food and drink offering$/i.test(category)) {
    return "Food";
  }

  if (/^direct from our roastery\b/i.test(category)) {
    return "Coffee Beans";
  }

  if (/^premium organic teas\b/i.test(category)) {
    return "Tea";
  }

  if (/^freshly cold pressed juices\b/i.test(category)) {
    return "Juices";
  }

  if (/^fresh sides & small plates\b/i.test(category)) {
    return "Sides";
  }

  if (/^enjoy our premium hot or cold brew coffee\b/i.test(category)) {
    return "Coffee Boxes";
  }

  return category;
}

export function createRecord({
  allergenSourceType,
  allergens,
  officialAllergenCoveredIds,
  category,
  description,
  imageUrl,
  ingredientsText,
  nutritionFacts,
  evidenceText,
  mayContain,
  name,
  isConfigurable = false,
  sourceKind,
  sourceUrl,
  variantGroup = null,
}) {
  return {
    allergens: uniqueStrings(allergens ?? []),
    allergenSourceType: allergenSourceType ?? allergenSourceTypes.unavailable,
    officialAllergenCoveredIds: uniqueStrings(
      officialAllergenCoveredIds ?? [],
    ),
    category: cleanText(category) ?? "Menu",
    description: cleanMenuDescription(description),
    evidenceText: cleanText(evidenceText),
    imageUrl,
    ingredientsText: cleanText(ingredientsText),
    nutritionFacts: normalizeNutritionFacts(nutritionFacts),
    isConfigurable,
    mayContain: uniqueStrings(mayContain ?? []),
    name: cleanMenuName(name),
    sourceKind,
    sourceUrl,
    variantGroup: cleanText(variantGroup),
  };
}

function cleanMenuDescription(description) {
  const cleaned = cleanText(description);

  if (
    !cleaned ||
    /^[×✕x]$/i.test(cleaned) ||
    /^description goes here$/i.test(cleaned) ||
    /^it all begins with an idea\b/i.test(cleaned) ||
    /^official .+(?:menu|nutrition|allergen|ingredient).*(?:api|data|source|pdf)\.?$/i.test(
      cleaned,
    )
  ) {
    return null;
  }

  return cleaned
    ?.replace(/\bStart Your Order\b/gi, "")
    .replace(/\bView Full Menu\b/gi, "")
    .replace(
      /\s+\bnew seasonal menu(?:\s+(?:breakfast|brunch|lunch|dinner))?\b\s*$/i,
      "",
    )
    .replace(/\s+\bTakeout Beverages\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNutritionFacts(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value)
    .map(([key, entryValue]) => [
      cleanText(key),
      normalizeNutritionFactValue(entryValue),
    ])
    .filter(
      ([key, entryValue]) =>
        key && entryValue !== null && entryValue !== undefined,
    );

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function nutritionFactsFromObject(value) {
  const nutrientFacts = nutritionFactsFromNutrientArray(
    value?.nutrient_facts?.nutrient ??
      value?.nutrientFacts?.nutrient ??
      value?.nutrients,
  );

  if (nutrientFacts) {
    return nutrientFacts;
  }

  const candidate =
    value?.nutrition ??
    value?.nutritionFacts ??
    value?.nutritionalInfo ??
    value;
  const fieldLabels = new Map([
    ["calories", "Calories"],
    ["fatCalories", "Calories from Fat"],
    ["caloriesFromFat", "Calories from Fat"],
    ["totalFat", "Total Fat"],
    ["saturated", "Saturated Fat"],
    ["saturatedFat", "Saturated Fat"],
    ["transFat", "Trans Fat"],
    ["transFattyAcids", "Trans Fat"],
    ["cholesterol", "Cholesterol"],
    ["sodium", "Sodium"],
    ["totalCarb", "Total Carbohydrates"],
    ["totalCarbohydrates", "Total Carbohydrates"],
    ["totalCarbs", "Total Carbohydrates"],
    ["carbohydrates", "Total Carbohydrates"],
    ["dietaryFiber", "Dietary Fiber"],
    ["fiber", "Dietary Fiber"],
    ["sugars", "Sugars"],
    ["addedSugars", "Added Sugars"],
    ["protein", "Protein"],
    ["calcium", "Calcium"],
    ["iron", "Iron"],
    ["potassium", "Potassium"],
    ["caffeine", "Caffeine"],
    ["servingWeight", "Serving Weight"],
  ]);
  const facts = {};

  const baseCalories = normalizeNutritionFactValue(candidate?.baseCalories);
  const maxCalories = normalizeNutritionFactValue(candidate?.maxCalories);

  if (baseCalories) {
    facts.Calories =
      maxCalories && maxCalories !== baseCalories
        ? `${baseCalories}-${maxCalories}`
        : baseCalories;
  }

  for (const [field, label] of fieldLabels) {
    const factValue = bestNutritionFactValue(candidate, field);

    if (factValue !== undefined && factValue !== null && factValue !== "") {
      facts[label] = factValue;
    }
  }

  return normalizeNutritionFacts(facts);
}

function nutritionFactsFromFieldList(fields) {
  const facts = {};

  for (const field of asArray(fields)) {
    const label = normalizeNutritionHeader(
      field?.label ?? field?.displayName ?? field?.key,
    );
    const value = field?.value ?? field?.displayValue;

    if (label && value !== undefined && value !== null && value !== "") {
      facts[label] = parseNutritionNumber(value) ?? cleanText(value);
    }
  }

  return normalizeNutritionFacts(facts);
}

function nutritionFactsFromHeaderCells(headers, cells) {
  const facts = {};

  headers.forEach((header, index) => {
    const label = normalizeNutritionHeader(header);
    const value = cells[index];

    if (label && value !== undefined && value !== null && value !== "") {
      facts[label] = parseNutritionNumber(value) ?? cleanText(value);
    }
  });

  return normalizeNutritionFacts(facts);
}

function nutritionFactsFromOrderedValues(values = []) {
  const labels = [
    "Calories",
    "Total Fat",
    "Saturated Fat",
    "Trans Fat",
    "Cholesterol",
    "Sodium",
    "Total Carbohydrates",
    "Dietary Fiber",
    "Sugars",
    "Protein",
  ];
  const facts = {};

  values.forEach((value, index) => {
    const label = labels[index];

    if (label && value !== undefined && value !== null && value !== "") {
      facts[label] = parseNutritionNumber(value) ?? cleanText(value);
    }
  });

  return normalizeNutritionFacts(facts);
}

function extractTrailingNutritionTextPdfItems(
  text,
  restaurant,
  url,
  options = {},
) {
  const records = [];
  let currentCategory = restaurant.category;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = cleanText(
      rawLine.replace(/\bless than 1 g\b/gi, "0.5").replace(/\bN\/A\b/gi, "0"),
    );

    if (!line || isTrailingNutritionTextNoise(line)) {
      continue;
    }

    if (isCategoryLine(line) || /^[A-Z][A-Z\s&'/-]+$/.test(line)) {
      currentCategory = titleCase(line.replace(/\s+cont\.$/i, ""));
      continue;
    }

    const parsed = parseTrailingNutritionTextLine(line);

    if (!parsed) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.unavailable,
        allergens: [],
        category: currentCategory,
        description:
          options.description ?? `Official ${restaurant.name} nutrition PDF.`,
        imageUrl: null,
        mayContain: [],
        name: parsed.name,
        nutritionFacts: nutritionFactsFromTrailingNutritionValues(
          parsed.values,
        ),
        sourceKind: "pdf-nutrition",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function parseTrailingNutritionTextLine(line) {
  const tokens = line.split(/\s+/).filter(Boolean);
  const values = [];

  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index].replace(/,/g, "");

    if (!isNutritionValueToken(token)) {
      break;
    }

    values.unshift(token);
  }

  if (values.length < 10) {
    return null;
  }

  const name = cleanTrailingNutritionTextName(
    tokens.slice(0, tokens.length - values.length).join(" "),
  );

  if (
    !name ||
    !isProbablyMenuItemName(name) ||
    isTrailingNutritionTextNoise(name)
  ) {
    return null;
  }

  return { name, values: values.slice(-11) };
}

function cleanTrailingNutritionTextName(value) {
  return cleanText(value)
    ?.replace(/\s+\.+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nutritionFactsFromTrailingNutritionValues(values) {
  const normalizedValues = values.length >= 11 ? values : [null, ...values];

  return normalizeNutritionFacts({
    Calories: normalizedValues[0],
    "Calories from Fat": normalizedValues[1],
    "Total Fat": normalizedValues[2],
    "Saturated Fat": normalizedValues[3],
    "Trans Fat": normalizedValues[4],
    Cholesterol: normalizedValues[5],
    Sodium: normalizedValues[6],
    "Total Carbohydrates": normalizedValues[7],
    "Dietary Fiber": normalizedValues[8],
    Sugars: normalizedValues[9],
    Protein: normalizedValues[10],
  });
}

function extractStatementAllergenNutritionPdfItems(
  text,
  restaurant,
  url,
  options = {},
) {
  const records = [];
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter(Boolean);
  let pending = null;

  const flushPending = () => {
    if (!pending) {
      return;
    }

    const notes = normalizeStatementAllergenText(pending.notes.join(" "));
    const allergenMatch = notes.match(
      /\bAllergen Statement:\s*(.*?)\s+Gluten Stat(?:e)?ment:\s*(.*?)\s+Cross Contact:\s*(.*)$/i,
    );

    if (!allergenMatch) {
      pending = null;
      return;
    }

    const directText = allergenMatch[1] ?? "";
    const glutenText = allergenMatch[2] ?? "";
    const crossContactText = allergenMatch[3] ?? "";
    const direct = /does not contain|no .*allergens/i.test(directText)
      ? []
      : findAllergensInText(directText);
    if (/\bcontains\s+gluten\b/i.test(glutenText)) {
      direct.push("gluten");
    }
    const mayContain = findAllergensInText(crossContactText);

    if (direct.length === 0 && mayContain.length === 0) {
      pending = null;
      return;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens: uniqueStrings(direct),
        category: pending.category ?? restaurant.category,
        description:
          options.description ??
          `Official ${restaurant.name} nutrition and allergen PDF.`,
        imageUrl: null,
        mayContain,
        name: pending.name,
        nutritionFacts: nutritionFactsFromStatementAllergenValues(
          pending.values,
        ),
        sourceKind: "pdf-allergen-statement",
        sourceUrl: url,
        variantGroup: pending.category ?? null,
      }),
    );
    pending = null;
  };

  let currentCategory = restaurant.category;

  for (const line of lines) {
    if (isStatementAllergenNutritionNoise(line)) {
      continue;
    }

    const entry = parseStatementAllergenNutritionLine(line);
    if (entry) {
      flushPending();
      pending = { ...entry, category: currentCategory, notes: [] };
      continue;
    }

    if (pending) {
      pending.notes.push(line);
      continue;
    }

    if (/^[A-Z][A-Z\s&'/-]+$/.test(line) && !/\bGUIDE\b/i.test(line)) {
      currentCategory = titleCase(line);
    }
  }

  flushPending();

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function parseStatementAllergenNutritionLine(line) {
  const match = line.match(
    /^(.+?)\s+((?:<?\d+(?:\.\d+)?(?:-\d+)?\s+){8}<?\d+(?:\.\d+)?)$/,
  );

  if (!match) {
    return null;
  }

  const name = cleanText(match[1]);
  const values = match[2].split(/\s+/).filter(Boolean);

  if (
    !name ||
    values.length !== 9 ||
    !isProbablyMenuItemName(name) ||
    isTrailingNutritionTextNoise(name)
  ) {
    return null;
  }

  return { name, values };
}

function normalizeStatementAllergenText(text) {
  return String(text)
    .replace(/\btreenuts\b/gi, "tree nuts")
    .replace(/\bshellfush\b/gi, "shellfish")
    .replace(/\bmay contains\b/gi, "may contain")
    .replace(/\bStatment\b/gi, "Statement")
    .replace(/\s+/g, " ")
    .trim();
}

function nutritionFactsFromStatementAllergenValues(values) {
  return normalizeNutritionFacts({
    Calories: values[0],
    "Total Fat": values[1],
    "Saturated Fat": values[2],
    Cholesterol: values[3],
    Sodium: values[4],
    "Total Carbohydrates": values[5],
    "Dietary Fiber": values[6],
    Sugars: values[7],
    Protein: values[8],
  });
}

function isStatementAllergenNutritionNoise(line) {
  return (
    isTrailingNutritionTextNoise(line) ||
    /^(?:SPRING \d{4}|April \d{4}|Notes|Fat|Saturated Fat|Carbohydrates|Total Dietary|Fiber|Protein|\(kcal\)|\(g\)|\(mg\))$/i.test(
      line,
    )
  );
}

function isTrailingNutritionTextNoise(line) {
  return (
    /^(?:Menu Item|Nutrition|Nutritional|NUTRITIONAL GUIDE|NUTRITIONAL INFORMATION|Calories|Calories from Fat|Total Fat|Saturated Fat|Trans Fat|Cholesterol|Sodium|Total Carbs|Dietary Fiber|Sugars|Protein|2,000 calories|Page \d+|Valid |Printed |Information is|All Rights Reserved|©|-- \d+ of \d+ --)$/i.test(
      line,
    ) ||
    /\b(?:calorie needs vary|general nutrition advice|menu item calories|contains raw or undercooked)\b/i.test(
      line,
    )
  );
}

function normalizeNutritionHeader(value) {
  const header = cleanText(value)
    ?.replace(/\([^)]*\)/g, "")
    .replace(/\bgrams?\b/gi, "")
    .replace(/\bmilligrams?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!header) {
    return null;
  }

  if (/^serving size$/i.test(header)) return "Serving Size";
  if (/^(?:total )?calories(?: per serving)?$/i.test(header)) return "Calories";
  if (/^calories from fat$/i.test(header)) return "Calories from Fat";
  if (/^(?:fat|total fat)$/i.test(header)) return "Total Fat";
  if (/^(?:sat\.?|saturated) fat$/i.test(header)) return "Saturated Fat";
  if (/^trans fat$/i.test(header)) return "Trans Fat";
  if (/^cholesterol$/i.test(header)) return "Cholesterol";
  if (/^sodium$/i.test(header)) return "Sodium";
  if (/^(?:carbohydrates?|carbs?|total carbohydrates?)$/i.test(header))
    return "Total Carbohydrates";
  if (/^(?:dietary )?fiber$/i.test(header)) return "Dietary Fiber";
  if (/^(?:sugar|sugars|total sugars)$/i.test(header)) return "Sugars";
  if (/^protein$/i.test(header)) return "Protein";
  if (/^caffeine$/i.test(header)) return "Caffeine";
  if (/^calcium$/i.test(header)) return "Calcium";
  if (/^iron$/i.test(header)) return "Iron";
  if (/^potassium$/i.test(header)) return "Potassium";

  return null;
}

function nutritionFactsFromNutrientArray(value) {
  const nutrients = asArray(value);

  if (nutrients.length === 0) {
    return undefined;
  }

  const facts = {};

  for (const nutrient of nutrients) {
    const label = cleanText(
      nutrient?.name ?? nutrient?.label ?? nutrient?.nutrientName,
    );
    const rawValue = nutrient?.value ?? nutrient?.amount ?? nutrient?.raw_value;

    if (
      !label ||
      rawValue === undefined ||
      rawValue === null ||
      rawValue === ""
    ) {
      continue;
    }

    facts[normalizeNutritionLabel(label)] =
      parseNutritionNumber(rawValue) ?? cleanText(rawValue);
  }

  return normalizeNutritionFacts(facts);
}

function normalizeNutritionLabel(value) {
  return (
    cleanText(value)
      ?.replace(/^Calories From Fat$/i, "Calories from Fat")
      .replace(/^Carbohydrates$/i, "Total Carbohydrates")
      .replace(/^Total Sugars$/i, "Sugars") ?? value
  );
}

function parseNutritionNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.replace(/,/g, "").trim();

  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) {
    return null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function bestNutritionFactValue(candidate, field) {
  const directValue = candidate?.[field];
  const calculatedField = `calculated${field[0]?.toUpperCase() ?? ""}${field.slice(1)}`;
  const calculatedValue = candidate?.[calculatedField];

  if (isMeaningfulNutritionValue(directValue)) {
    return directValue;
  }

  if (isMeaningfulNutritionValue(calculatedValue)) {
    return calculatedValue;
  }

  return directValue;
}

function isMeaningfulNutritionValue(value) {
  if (value === undefined || value === null || value === "") {
    return false;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) && value !== 0;
  }

  return true;
}

function normalizeNutritionFactValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    return cleanText(value);
  }

  return null;
}

function findAllergensInDeclaredFoodText(text) {
  const declared = findDeclaredAllergensOnly(text);

  if (declared.length > 0) {
    return declared;
  }

  return findAllergensInText(text);
}

function findDeclaredAllergensOnly(text) {
  const sourceText = String(text);
  const directSections = [
    ...sourceText.matchAll(
      /\b(?:contains|allergens?|allerg(?:en|y)\s+alerts?)\s*:?\s*([^.\n;*]+)/gi,
    ),
  ]
    .filter(
      (match) => match.index == null || sourceText[match.index - 1] !== "-",
    )
    .map((match) => match[1])
    .map((section) =>
      section
        .replace(/\bnon[- ]?dairy(?:\s+\w+){0,3}\s+yogurt\b/gi, "")
        .replace(/\bnon[- ]?dairy\b/gi, "")
        .replace(
          /\b(?:packed|made|processed|prepared)\s+in\s+(?:a\s+)?(?:facility|kitchen)[\s\S]*$/i,
          "",
        )
        .replace(
          /\b(?:facility|kitchen)\s+(?:that\s+)?(?:also\s+)?(?:handles?|process(?:es|ed)?|uses)[\s\S]*$/i,
          "",
        )
        .trim(),
    )
    .filter((section) => findAllergensInText(section).length > 0);

  if (directSections.length > 0) {
    return uniqueStrings(directSections.flatMap(findAllergensInText));
  }

  return [];
}

function findOfficialIngredientListAllergens(text) {
  const sourceText = String(text ?? "");

  if (!/\bIngredients?\s*:|\bIngredients?\b/i.test(sourceText)) {
    return [];
  }

  const ingredientText = sourceText
    .replace(
      /\b(?:packed|made|processed|prepared)\s+in\s+(?:a\s+)?(?:facility|kitchen)[\s\S]*$/i,
      "",
    )
    .replace(
      /\b(?:facility|kitchen)\s+(?:that\s+)?(?:also\s+)?(?:handles?|process(?:es|ed)?|uses)[\s\S]*$/i,
      "",
    )
    .replace(
      /\bgluten[- ]?free(?:\s+\w+){0,3}\s+(?:bread\s*crumbs?|breadcrumbs?|bread|bun|roll|pasta|flour)\b/gi,
      "",
    )
    .replace(
      /\b(?:dairy|milk|egg|soy|sesame|peanut|tree[- ]?nut|nut|wheat|gluten|fish|shellfish)[- ]free\b/gi,
      "",
    )
    .replace(
      /\bfree\s+of\s+(?:dairy|milk|egg|soy|sesame|peanut|tree[- ]?nut|nut|wheat|gluten|fish|shellfish)\b/gi,
      "",
    )
    .replace(/\bnon[- ]?dairy(?:\s+\w+){0,3}\s+yogurt\b/gi, "")
    .replace(/\bnon[- ]?dairy\b/gi, "");

  return findAllergensInText(ingredientText);
}

function findMayContainAllergens(text) {
  const value = String(text);
  const matches = [
    ...value.matchAll(/\bmay contain\s*:?\s*([^.\n;]+)/gi),
    ...value.matchAll(
      /\b(?:packed|made|processed|prepared)\s+in\s+(?:a\s+)?(?:facility|kitchen)\s+(?:that\s+)?(?:also\s+)?(?:handles?|process(?:es|ed)?|uses)\s*:?\s*([\s\S]*?)(?=\bIngredients?\s*:|\bProduct\s*&\s*Storage\s+Details\b|[.\n;]|$)/gi,
    ),
    ...value.matchAll(
      /\b(?:facility|kitchen)\s+(?:that\s+)?(?:also\s+)?(?:handles?|process(?:es|ed)?|uses)\s*:?\s*([\s\S]*?)(?=\bIngredients?\s*:|\bProduct\s*&\s*Storage\s+Details\b|[.\n;]|$)/gi,
    ),
  ];
  return uniqueStrings(
    matches.flatMap((match) => findAllergensInText(match[1])),
  );
}

function findAllergensInText(text) {
  const normalized = ` ${String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")} `;
  const matches = [];

  for (const allergen of allergenTerms) {
    if (
      allergen.terms.some((term) =>
        normalized.includes(
          ` ${term.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `,
        ),
      )
    ) {
      matches.push(allergen.id);
    }
  }

  return uniqueStrings(matches);
}

function normalizeProviderAllergens(values) {
  return uniqueStrings(
    values.flatMap((value) => {
      const normalized = String(value)
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "");
      const mapped = providerAllergenCodes.get(normalized);

      return mapped ? [mapped] : findAllergensInText(value);
    }),
  );
}

function getOfficialFoodDisclosure(node, kind) {
  const propertyText = schemaPropertyDisclosureText(node?.additionalProperty);
  const allergenText = joinDisclosureText([
    stringifySelectedFields(node, [
      "allergen",
      "allergens",
      "allergenInfo",
      "allergenInformation",
      "contains",
      "dietaryRestrictions",
    ]),
    propertyText.allergenText,
  ]);
  const ingredientText = joinDisclosureText([
    stringifySelectedFields(node, ["ingredients", "ingredientStatement"]),
    propertyText.ingredientText,
  ]);
  const mayContainText = joinDisclosureText([
    stringifySelectedFields(node, ["mayContain", "mayContains"]),
    propertyText.mayContainText,
  ]);

  if (allergenText) {
    const partitionedAllergens = partitionAllergenDisclosure(allergenText);
    const combinedMayContainText = joinDisclosureText([
      partitionedAllergens.mayContainText,
      mayContainText,
    ]);

    return {
      allergenSourceType:
        kind === sourceTypes.allergen
          ? allergenSourceTypes.officialAllergenMenu
          : allergenSourceTypes.officialProductAllergenSection,
      directAllergens: uniqueStrings([
        ...findDeclaredAllergensOnly(partitionedAllergens.directText),
        ...findAllergensInText(partitionedAllergens.directText),
      ]),
      ingredientsText: ingredientText,
      mayContain: uniqueStrings([
        ...findMayContainAllergens(`${allergenText} ${mayContainText}`),
        ...findAllergensInText(combinedMayContainText),
      ]),
    };
  }

  if (ingredientText) {
    return {
      allergenSourceType: allergenSourceTypes.officialIngredients,
      directAllergens: findAllergensInDeclaredFoodText(ingredientText),
      ingredientsText: ingredientText,
      mayContain: findMayContainAllergens(
        `${ingredientText} ${mayContainText}`,
      ),
    };
  }

  if (mayContainText) {
    return {
      allergenSourceType:
        kind === sourceTypes.allergen
          ? allergenSourceTypes.officialAllergenMenu
          : allergenSourceTypes.officialProductAllergenSection,
      directAllergens: [],
      ingredientsText: null,
      mayContain: findAllergensInText(mayContainText),
    };
  }

  return {
    allergenSourceType: allergenSourceTypes.unavailable,
    directAllergens: [],
    ingredientsText: null,
    mayContain: [],
  };
}

function partitionAllergenDisclosure(text) {
  const normalized = cleanText(text);

  if (!normalized || !normalized.includes(";")) {
    return {
      directText: normalized,
      mayContainText: "",
    };
  }

  const [directText, ...mayContainSegments] = normalized
    .split(";")
    .map(cleanText);

  return {
    directText,
    mayContainText: mayContainSegments.join(" "),
  };
}

function schemaPropertyDisclosureText(properties) {
  const disclosure = {
    allergenText: "",
    ingredientText: "",
    mayContainText: "",
  };

  for (const property of asArray(properties)) {
    if (!property || typeof property !== "object") {
      continue;
    }

    const name = cleanText(
      pickString(property.name) ??
        pickString(property.propertyID) ??
        pickString(property.identifier) ??
        pickString(property.label),
    );
    const value = stringifyStructuredFieldValue(
      property.value ?? property.description ?? property.text,
    );

    if (!name || !value) {
      continue;
    }

    if (/\bmay\s+contain|cross[-\s]?contact|traces?\b/i.test(name)) {
      disclosure.mayContainText = joinDisclosureText([
        disclosure.mayContainText,
        value,
      ]);
    } else if (/\ballergens?|contains|dietary\s+restrictions?\b/i.test(name)) {
      disclosure.allergenText = joinDisclosureText([
        disclosure.allergenText,
        value,
      ]);
    } else if (/\bingredients?\b/i.test(name)) {
      disclosure.ingredientText = joinDisclosureText([
        disclosure.ingredientText,
        value,
      ]);
    }
  }

  return disclosure;
}

function stringifyStructuredFieldValue(value) {
  if (!hasMeaningfulStructuredValue(value)) {
    return "";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return cleanText(value);
  }

  if (Array.isArray(value)) {
    return joinDisclosureText(value.map(stringifyStructuredFieldValue));
  }

  if (value && typeof value === "object") {
    return (
      pickString(value.name) ??
      pickString(value.value) ??
      pickString(value.text) ??
      JSON.stringify(value).slice(0, 1000)
    );
  }

  return "";
}

function joinDisclosureText(values) {
  return cleanText(values.map(cleanText).filter(Boolean).join(" "));
}

function getScopedDomDisclosure($element, kind) {
  const allergenText = cleanText(
    $element
      .find(
        "[class*='allergen'], [id*='allergen'], [class*='contains'], [id*='contains']",
      )
      .text(),
  );
  const ingredientText = cleanText(
    $element.find("[class*='ingredient'], [id*='ingredient']").text(),
  );

  if (allergenText) {
    const directAllergens = uniqueStrings([
      ...findDeclaredAllergensOnly(allergenText),
      ...findAllergensInText(allergenText),
    ]);
    const mayContain = findMayContainAllergens(allergenText);

    if (
      directAllergens.length === 0 &&
      mayContain.length === 0 &&
      !ingredientText
    ) {
      return {
        allergenSourceType: allergenSourceTypes.unavailable,
        directAllergens: [],
        ingredientsText: null,
        mayContain: [],
      };
    }

    return {
      allergenSourceType:
        kind === sourceTypes.allergen
          ? allergenSourceTypes.officialAllergenMenu
          : allergenSourceTypes.officialProductAllergenSection,
      directAllergens,
      ingredientsText: ingredientText,
      mayContain,
    };
  }

  if (ingredientText) {
    return {
      allergenSourceType: allergenSourceTypes.officialIngredients,
      directAllergens: findAllergensInDeclaredFoodText(ingredientText),
      ingredientsText: ingredientText,
      mayContain: findMayContainAllergens(ingredientText),
    };
  }

  return {
    allergenSourceType: allergenSourceTypes.unavailable,
    directAllergens: [],
    ingredientsText: null,
    mayContain: [],
  };
}

function stringifySelectedFields(node, keys) {
  const selected = {};

  for (const key of keys) {
    if (hasMeaningfulStructuredValue(node?.[key])) {
      selected[key] = node[key];
    }
  }

  return Object.keys(selected).length > 0
    ? JSON.stringify(selected).slice(0, 5000)
    : "";
}

function hasMeaningfulStructuredValue(value) {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return cleanText(value) !== null;
  }

  if (Array.isArray(value)) {
    return value.some(hasMeaningfulStructuredValue);
  }

  if (typeof value === "object") {
    return Object.values(value).some(hasMeaningfulStructuredValue);
  }

  return true;
}

function parseArgs(rawArgs) {
  const parsed = {};

  for (const arg of rawArgs) {
    if (!arg.startsWith("--")) {
      continue;
    }

    const [key, ...value] = arg.slice(2).split("=");
    parsed[key] = value.length > 0 ? value.join("=") : "true";
  }

  return parsed;
}

function parseJsonLoose(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function isCliEntry() {
  return (
    process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  );
}

function decodeJavaScriptString(value) {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\u002D/g, "-");
  }
}

function decodeHtml(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#34;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ");
}

function cleanText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = decodeHtml(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length > 0 ? cleaned : null;
}

function cleanMenuName(name) {
  return cleanText(name)
    ?.replace(/^[*•~\s]+/, "")
    ?.replace(/^[–—-]\s*/, "")
    ?.replace(/^[–—-]\s*(.+?)\s*[–—-]$/, "$1")
    ?.replace(/\s+\|.*$/, "")
    .replace(/\b(?:[A-Z]\s+){2,}[A-Z]\b/g, (match) => match.replace(/\s+/g, ""))
    .replace(/\s+-\s+(?:baked & wired|busboys and poets)$/i, "")
    .replace(/\s+-\s+Nutrition.*$/i, "")
    .replace(/\s+Menu Item$/i, "")
    .replace(/\s+\d+(?:\.\d+)?\s*(?:g|mg|mL|L|oz)\b.*$/i, "")
    .replace(
      /\s+(?:(?:<?\d+(?:\.\d+)?|\d+\s*-\s*\d+)\s+){3,}(?:<?\d+(?:\.\d+)?|\d+\s*-\s*\d+)$/i,
      "",
    )
    .replace(/([a-z])v\s+\(ve\)$/i, "$1")
    .replace(/\*+\s+\$?\d+(?:\.\d{1,2})?\s*$/g, "")
    .replace(/\s+-\s*(?:market price)?$/i, "")
    .replace(/^[A-Z][A-Z '&/-]{5,}\s+([A-Z][a-z].*)$/, "$1")
    .replace(/(?<!\b[Ff]or)\s+\$?\d+(?:\.\d{1,2})?\s*$/g, "")
    .replace(/\*+$/, "")
    .replace(/\s*[–—-]+\s*$/g, "")
    .replace(/\s*\.$/, "")
    .replace(/((?:\s+|[/,]\s*)\(?[A-Za-z]{1,3}\)?){2,}$/g, (match) =>
      isTrailingMenuCodeCluster(match) ? "" : match,
    )
    .trim();
}

function isTrailingMenuCodeCluster(value) {
  const tokens = String(value).match(/[A-Za-z]{1,3}/g) ?? [];

  if (tokens.length < 2) {
    return false;
  }

  const knownCodes = new Set([
    "df",
    "gf",
    "gfo",
    "n",
    "nf",
    "sf",
    "v",
    "ve",
    "vg",
    "vgo",
  ]);

  const unknownUppercaseTokens = tokens.filter(
    (token) =>
      !knownCodes.has(token.toLowerCase()) && token === token.toUpperCase(),
  );

  return (
    tokens.every((token) => knownCodes.has(token.toLowerCase())) ||
    (tokens.length >= 3 &&
      unknownUppercaseTokens.length > 0 &&
      tokens.every(
        (token) =>
          knownCodes.has(token.toLowerCase()) || token === token.toUpperCase(),
      ))
  );
}

function normalizeMenuName(name) {
  return cleanMenuName(name)
    ?.toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasFoodLanguage(text) {
  return /\b(taco|burger|bun|sandwich|salad|bowl|pizza|paella|fideu[áa]|gambas|chicken|shrimps?|prawns?|fish|egg|cheese|cookie|cake|pie|fries|wings|soup|rice|beans|churro|empanada|quesadilla|torta|pasta|oysters?|steak|bacon|sausage|coffee|tea|juice|hummus|falafel|kabob|kebab|shawarma|pita|naan|curry|paneer|lamb|beef|veal|pork|crab|lobster|mussels?|clams?|scallops?|octopus|calamari|squid|tuna|hamachi|yellowfin|salmon|cod|branzino|duck|gnocchi|ravioli|noodles|dumplings?|bao|toast|bagel|muffin|croissant|waffle|pancake|yogurt|granola|smoothie|tofu|kimchi|tteok|ddeok|tteokbokki|ddeok[- ]?bokki|rice cake|tartare|picc?atta|scaloppin[ei]|vegetables?|mushrooms?|asparagus|cauliflower|peas|carrots?|cabbage|potatoes?|greens?|romaine|croutons?|sauce|mozzarella|basil|pesto|feta|parmesan|provolone|pecorino|reggiano|arugula|honey|marinara|pepperoni|meatballs?|almonds?|gelato|ice cream|bread pudding)\b/i.test(
    text ?? "",
  );
}

function hasSubstantialFoodLanguage(text) {
  return /\b(taco|burger|bun|sandwich|salad|bowl|pizza|paella|fideu[áa]|gambas|chicken|shrimps?|prawns?|fish|egg|cheese|cookie|cake|pie|fries|wings|soup|rice|beans|churro|empanada|quesadilla|torta|pasta|oysters?|steak|bacon|sausage|hummus|falafel|kabob|kebab|shawarma|pita|naan|curry|paneer|lamb|beef|veal|pork|crab|lobster|mussels?|clams?|scallops?|octopus|calamari|squid|tuna|hamachi|yellowfin|salmon|cod|branzino|duck|gnocchi|ravioli|noodles|dumplings?|bao|toast|bagel|muffin|croissant|waffle|pancake|yogurt|granola|tofu|kimchi|tteok|ddeok|tteokbokki|ddeok[- ]?bokki|rice cake|tartare|picc?atta|scaloppin[ei]|vegetables?|mushrooms?|asparagus|cauliflower|peas|carrots?|cabbage|potatoes?|greens?|romaine|croutons?|mozzarella|basil|pesto|feta|parmesan|provolone|pecorino|reggiano|arugula|marinara|pepperoni|meatballs?|almonds?|gelato|ice cream|bread pudding)\b/i.test(
    text ?? "",
  );
}

function isProbablyCategoryName(name) {
  const cleaned = cleanText(name);

  if (!cleaned || cleaned.length > 55 || cleaned.split(/\s+/).length > 6) {
    return false;
  }

  if (!/[a-z]/i.test(cleaned)) {
    return false;
  }

  if (catalogArtifactNamePatterns.some((pattern) => pattern.test(cleaned))) {
    return false;
  }

  return !/^(home|menu|nutrition|allergens?|privacy|terms|locations?|careers)$/i.test(
    cleaned,
  );
}

function isProbablyMenuItemName(name) {
  const cleaned = cleanMenuName(name);

  if (!cleaned || cleaned.length < 3 || cleaned.length > 90) {
    return false;
  }

  if (/^(?:name|description|nutrition allergen statement)$/i.test(cleaned)) {
    return false;
  }

  if (!/[a-z]/i.test(cleaned)) {
    return false;
  }

  if (skipNamePatterns.some((pattern) => pattern.test(cleaned))) {
    return false;
  }

  if (cleaned.includes(";")) {
    return false;
  }

  if (hasSpacedOutLetterText(cleaned)) {
    return false;
  }

  if (cleaned.split(/\s+/).length >= 7 && /[.!?]$/.test(cleaned)) {
    return false;
  }

  if (cleaned.split(/\s+/).length > 6 && cleaned.includes(",")) {
    return false;
  }

  if (isLikelyMenuDescriptionFragmentName(cleaned)) {
    return false;
  }

  if (/^(click|view|download|order|select|choose)\b/i.test(cleaned)) {
    return false;
  }

  return true;
}

function hasSpacedOutLetterText(value) {
  const tokens = String(value ?? "")
    .trim()
    .split(/\s+/);
  const singleLetterTokens = tokens.filter((token) =>
    /^[A-Za-z]$/.test(token),
  ).length;

  return (
    singleLetterTokens >= 4 &&
    singleLetterTokens / Math.max(tokens.length, 1) >= 0.55
  );
}

function isLikelyMenuDescriptionFragmentName(name) {
  const words = cleanText(name)?.split(/\s+/) ?? [];

  if (/^(?:the comforting\b|marinated\b.+\bwith\b)/i.test(name)) {
    return true;
  }

  if (words.length < 6) {
    return false;
  }

  if (/\b(?:with|of|in|and|to|for)$/i.test(name)) {
    return true;
  }

  return false;
}

export function filterMenuCatalogRecords(records) {
  return records.filter(isProbablyMenuCatalogRecord);
}

function preferHighConfidenceMenuRecords(records) {
  const reviewedFixtureRecords = records.filter((record) =>
    /^reviewed-/i.test(record.sourceKind ?? record.sourceType ?? ""),
  );

  if (reviewedFixtureRecords.length >= 4) {
    return reviewedFixtureRecords;
  }

  const highConfidenceDomKinds = new Set([
    "elementor-menu-heading",
    "laravel-menu-product",
    "leye-item-wrap",
    "menu-list-block",
    "json-structured",
    "popmenu-apollo-state",
    "webflow-cms-menu",
  ]);
  const highConfidenceCount = records.filter((record) =>
    highConfidenceDomKinds.has(record.sourceKind ?? record.sourceType),
  ).length;

  if (highConfidenceCount < 10) {
    return records;
  }

  return records.filter((record) => {
    const sourceKind = record.sourceKind ?? record.sourceType;
    return !["html-card", "html-link"].includes(sourceKind);
  });
}

export function isProbablyMenuCatalogRecord(record) {
  const name = cleanMenuName(record?.name);
  const category = cleanText(record?.category);
  const description = cleanText(record?.description);

  if (!name) {
    return false;
  }

  if (
    /^new g$/i.test(name) &&
    /^pies$/i.test(category ?? "") &&
    ((record?.sourceKind ?? record?.sourceType) === "html-menu" ||
      /^https?:\/\/(?:www\.)?andpizza\.com\//i.test(record?.sourceUrl ?? "") ||
      asArray(record?.sourceUrls).some((sourceUrl) =>
        /^https?:\/\/(?:www\.)?andpizza\.com\//i.test(sourceUrl ?? ""),
      ))
  ) {
    return true;
  }

  if (
    /^@me don[’']t sub me$/i.test(name) &&
    /^pies$/i.test(category ?? "") &&
    ((record?.sourceKind ?? record?.sourceType) === "html-menu" ||
      asArray(record?.sourceUrls).some((sourceUrl) =>
        /^https?:\/\/(?:www\.)?andpizza\.com\//i.test(sourceUrl ?? ""),
      ))
  ) {
    return true;
  }

  if (isOfficialWidgetEvidenceBackedCatalogRecord(record)) {
    return true;
  }

  if (isClearlyDescribedShortMenuItem(name, category, description)) {
    return true;
  }

  if (catalogArtifactNamePatterns.some((pattern) => pattern.test(name))) {
    return false;
  }

  if (isLikelyMenuDescriptionFragmentName(name)) {
    return false;
  }

  if (
    category &&
    catalogArtifactCategoryPatterns.some((pattern) => pattern.test(category)) &&
    !hasSubstantialFoodLanguage(`${name} ${description ?? ""}`)
  ) {
    return false;
  }

  if (
    (record?.sourceKind ?? record?.sourceType) === "leye-item-wrap" &&
    /^bin\s+\d+\b/i.test(description ?? "")
  ) {
    return false;
  }

  if (/^menu$/i.test(category) && /\$\s*\d/.test(name)) {
    return false;
  }

  if (description && /^choice of$/i.test(description)) {
    return false;
  }

  if (
    /^elixir$/i.test(name) &&
    /\b(?:soda water|cordial|q mixers)\b/i.test(description)
  ) {
    return false;
  }

  if (
    description &&
    /\b(?:explore our favorites|favorites loved daily)\b/i.test(description)
  ) {
    return false;
  }

  if (
    description &&
    /\b(?:book a table|customer service|quality of food|been coming here|coming soon|sign up if you love|join our newsletter)\b/i.test(
      description,
    ) &&
    !hasFoodLanguage(`${name} ${description}`)
  ) {
    return false;
  }

  if (
    description &&
    /\b(?:video courtesy|chef de cuisine|every dish tells a story)\b/i.test(
      description,
    )
  ) {
    return false;
  }

  if (
    description &&
    /\b(?:host your next event|perfect spot to host)\b/i.test(description)
  ) {
    return false;
  }

  if (description && /\bdog (?:cookies?|treats?)\b/i.test(description)) {
    return false;
  }

  if (description && /^order .+ online from\b/i.test(description)) {
    return false;
  }

  if (description && /^order .+ from \d{3,5}\b/i.test(description)) {
    return false;
  }

  if (
    record?.sourceType === "json-structured" &&
    description &&
    /\bdishes available at\b/i.test(description)
  ) {
    return false;
  }

  if (
    description &&
    /\bclosed until \d{1,2}:\d{2}\s*(?:am|pm)\b/i.test(description)
  ) {
    return false;
  }

  if (
    description &&
    /\b(?:closed|open)\s+now\b/i.test(description) &&
    /\d{10}/.test(description)
  ) {
    return false;
  }

  if (description && /\bmenu prices below reflect\b/i.test(description)) {
    return false;
  }

  if (/\bview restaurant$/i.test(name)) {
    return false;
  }

  if (description && isProbablyCommercePlanRecord(description)) {
    return false;
  }

  if (description && isProbablyWineListRecord(name, description)) {
    return false;
  }

  if (description && /^\s*OUT OF STOCK\b/i.test(description)) {
    return false;
  }

  if (description && isProbablyLocationCardRecord(name, description)) {
    return false;
  }

  if (
    isProbablyAlcoholOnlyCatalogRecord(
      record,
      name,
      description,
      category,
      [
        "html-card",
        "leye-item-wrap",
        "next-flight-products",
        "pdf-menu",
        "pdf-menu-grid",
        "square-online-api",
      ].includes(record?.sourceKind ?? record?.sourceType),
    )
  ) {
    return false;
  }

  return true;
}

function isOfficialWidgetEvidenceBackedCatalogRecord(record) {
  return (
    /(?:official-allergen-widget|everybite-widget-graphql)/i.test(
      `${record?.sourceType ?? ""} ${record?.sourceKind ?? ""} ${record?.allergenSourceType ?? ""}`,
    ) &&
    ((Array.isArray(record?.knownIngredients) &&
      record.knownIngredients.length > 0) ||
      cleanText(record?.ingredientsText).length > 0 ||
      (Array.isArray(record?.allergens) && record.allergens.length > 0) ||
      (Array.isArray(record?.mayContain) && record.mayContain.length > 0) ||
      Array.isArray(record?.evidence))
  );
}

function isClearlyDescribedShortMenuItem(name, category, description) {
  const text = `${name ?? ""} ${category ?? ""} ${description ?? ""}`;

  if (
    /^caesar$/i.test(name ?? "") &&
    /\bsalads?\b/i.test(category ?? "") &&
    /\b(?:romaine|croutons?|parm(?:esan|igiano)|reggiano)\b/i.test(
      description ?? "",
    ) &&
    hasSubstantialFoodLanguage(text)
  ) {
    return true;
  }

  return false;
}

function isProbablyLocationCardRecord(name, description) {
  const text = `${name ?? ""} ${description ?? ""}`;
  const hasAddress =
    /\b\d{3,5}\s+[A-Za-z0-9.' -]+(?:avenue|ave|street|st|road|rd|boulevard|blvd|place|pl|drive|dr|lane|ln)\b/i.test(
      text,
    );
  const hasPhone = /\(?\d{3}\)?[-\s]?\d{3}[-\s]\d{4}/.test(text);
  const hasHours =
    /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b.*\b\d{1,2}\s*(?:a|p|am|pm)\b/i.test(
      text,
    );
  const nameLooksLikeBrand = cleanMenuName(name).split(/\s+/).length <= 4;

  return nameLooksLikeBrand && hasAddress && (hasPhone || hasHours);
}

function isProbablyCommercePlanRecord(description) {
  return /\b(?:automatically charge precise tax|credit card payments|native integration to|no transaction fees|payment gateways|store will look beautiful|your profit is|your wix site)\b/i.test(
    description,
  );
}

function isProbablyStrictNonFoodMenuRecord(record, source = null) {
  if (
    source?.includeNonAlcoholicBeverages === true &&
    /^(?:catering\s+)?(?:beverages?|drinks?|fountain sodas?)$/i.test(
      cleanText(record?.category) ?? "",
    )
  ) {
    return false;
  }

  return isProbablyAlcoholOnlyCatalogRecord(
    record,
    cleanMenuName(record?.name),
    cleanText(record?.description),
    cleanText(record?.category),
    true,
  );
}

function isProbablyWineListRecord(name, description) {
  if (hasFoodLanguage(`${name ?? ""} ${description ?? ""}`)) {
    return false;
  }

  return (
    /\b(?:aligot[eé]|altesse|armagnac|brut|gamay|gras manseng|marsanne|meunier|petit manseng|pineau d[’']aunis|poulsard|reisling|riesling|roussane|rousanne|savagnin|tibouren|trousseau)\b/i.test(
      description,
    ) &&
    /\|\s*(?:[A-Z][A-Za-zÀ-ÿ'&.-]+|Organic|Biodynamic|Sustainable|Extra Brut)/.test(
      description,
    )
  );
}

function isProbablyAlcoholOnlyCatalogRecord(
  record,
  name,
  description,
  category,
  strict = false,
) {
  if (
    record?.allergenSourceType &&
    record.allergenSourceType !== allergenSourceTypes.unavailable
  ) {
    return false;
  }

  const sourceKind = record?.sourceKind ?? record?.sourceType;
  const isLooseBrowserHtmlMenuRecord =
    record?.browserFetched === true &&
    ["html-card", "html-link", "menu-list-block"].includes(sourceKind);

  if (!strict && !isLooseBrowserHtmlMenuRecord) {
    return false;
  }

  const text = `${name ?? ""} ${description ?? ""}`;
  const categoryText = category ?? "";
  const categoryIsAlcoholOnly =
    /\b(?:absinthe|amari|amaro|armagnac|beer|bordeaux|bottles?|bourbon|brandy|cacha[çc]a|calvados|champagne|cider|cognac|cordial|gin|large format|liqueur|mezcal|ros[ée]|rum|sake|scotch|special verticals|spirits?|tequila|vodka|whisk(?:e)?y|wine|wines)\b/i.test(
      categoryText,
    );
  const categoryIsCountryWineList =
    /^(?:more\s+)?(?:france|usa|italy|australia)$/i.test(categoryText.trim());
  const categoryIsBeverageOnly =
    /^(?:coffee|drink specials?(?:\s*\$\d+)?|tea)$/i.test(categoryText.trim());
  const categorySuggestsBeverage =
    /\b(?:beer|beverage|bottles?|cans?|cocktails?|drink|happy hour|margaritas?|mocktails?|mojitos?|spritz|spirits?|wine|wines)\b/i.test(
      categoryText,
    );

  if (/\broot beer\b/i.test(text)) {
    return false;
  }

  const hasFood = hasSubstantialFoodLanguage(text);
  const nameIsSimpleBeverage =
    /^(?:boylan creme soda|canned soda|club soda|coca-?cola|coke|diet coke|dr\.?\s*browns?\s+ginger ale|ginger ale|iced tea|lemonade|mexican soda|soda water|sparkling water|sprite|tonic water|water)$/i.test(
      name?.trim() ?? "",
    ) ||
    /^(?:apple|cranberry|grapefruit|hibiscus|orange|pineapple|tomato)\s+(?:iced\s+)?(?:juice|tea)(?:\s+box)?$/i.test(
      name?.trim() ?? "",
    );
  const textSuggestsAlcoholOnly =
    /\b(?:aperol|beer|brut|cider|cocktail|gin|ipa|lager|liqueur|malt\s+liquor|mezcal|porter|prosecco|rum|sake|tequila|vodka|whisk(?:e)?y|wine)\b/i.test(
      text,
    );
  const textSuggestsDrinkOnly =
    /\b(?:iced\s+black\s+tea|juice|lemonade|soda\s+water|sparkling\s+water)\b/i.test(
      text,
    );

  if (strict && categoryIsAlcoholOnly && !hasFood) {
    return true;
  }

  if (strict && categoryIsBeverageOnly && !hasFood) {
    return true;
  }

  if (strict && nameIsSimpleBeverage) {
    return true;
  }

  if (
    strict &&
    !hasFood &&
    /\b(?:standard\s*)?1\.5\s*oz\b|\b2\.5\s*oz\b|\b6\s*oz\b.*\b9\s*oz\b.*\bbottle\b|\b16\s*oz\b.*\b23\s*oz\b|\bbottle\b/i.test(
      text,
    )
  ) {
    return true;
  }

  if (!hasFood && (categoryIsAlcoholOnly || categoryIsBeverageOnly)) {
    return true;
  }

  if (
    strict &&
    categoryIsCountryWineList &&
    /(?:^[‘'’]?\d{2,4}\b|\b(?:alsace|beaujolais|bordeaux|bourgogne|burgundy|cabernet|chablis|chardonnay|c[ôo]te|cru|cuv[ée]e|merlot|pinot|riesling|ros[ée]|sancerre|sauvignon|wine)\b)/i.test(
      text,
    )
  ) {
    return true;
  }

  if (
    /^\s*BTL\b/i.test(name ?? "") ||
    /\(\s*(?:4|6|12)[-\s]*pack\s*\)/i.test(name ?? "") ||
    /\b(?:IPA|lager|pilsner|stout)\b/i.test(name ?? "") ||
    /\b(?:alagash|allagash|ale|bloody mary|bulleit|carajillo|cuba libre|espresso martini|gin fizz|hakushika|kuni zakari|lagunitas|martini|mezcal|michelada|michelob|michter'?s|miller high life|nigori|orion|pale ale|redemption rye|sake|sapporo|soto junmai|vodka|whistlepig)\b/i.test(
      name ?? "",
    ) ||
    /\b(?:hakushika|kuni zakari|lagunitas|michelob|michter'?s|miller high life|nigori|orion|redemption rye|soto junmai|whistlepig)\b/i.test(
      text,
    )
  ) {
    return true;
  }

  if (
    categorySuggestsBeverage &&
    /\b(?:aperol|beer|cider|cocktail|coffee liqueur|liqueur|mezcal|mojito|prosecco|spritz|tequila|vodka|wine)\b/i.test(
      text,
    )
  ) {
    return true;
  }

  if (
    !hasFood &&
    (categorySuggestsBeverage || textSuggestsAlcoholOnly) &&
    textSuggestsAlcoholOnly
  ) {
    return true;
  }

  if (!hasFood && textSuggestsDrinkOnly) {
    return true;
  }

  if (hasFood) {
    return false;
  }

  return /(?:^[‘'’]?\d{2}\b|\b(?:albarino|añejo|amaro|amontillado|assyrtiko|barolo|beaujolais|beer|blanco|bordeaux|bourbon|brandy|cabernet|cava|chardonnay|champagne|chenin blanc|cinsault|cocktail|cognac|cotes? du rhone|côtes? du rhône|dolcetto|domaine|espumoso|garnacha|gin|godello|grenache|gruner veltliner|ipa|joven|lager|lambrusco|limniona|liqueur|makgeolli|malbec|manzanilla|mezcal|montepulciano|moschofilero|negroni|orange wine|pilsner|pinot|reposado|rhone|rhône|riesling|rosé|rum|sake|sancerre|sangiovese|sauvignon|sherry|soju|stout|syrah|tequila|tempranillo|tobalá|vermouth|vodka|whiskey|whisky|wine|xinomavro)\b|\bBTL\b)/i.test(
    text,
  );
}

function isCategoryLine(line) {
  return (
    /^[A-Z0-9 &+/'()-]{3,55}$/.test(line) &&
    /[A-Z]{3}/.test(line) &&
    !/\d{2,}/.test(line) &&
    !/\b(CALORIES|SODIUM|CARBS|PROTEIN|SUGARS|FAT|SERVING)\b/i.test(line)
  );
}

function summarizeIngredientText(text) {
  const cleaned = cleanText(text);

  if (!cleaned) {
    return null;
  }

  return cleaned.length > 240 ? `${cleaned.slice(0, 237).trim()}...` : cleaned;
}

function inferCategoryFromUrl(url) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const segments = parsed.pathname
      .split("/")
      .filter(Boolean)
      .map((segment) =>
        segment.replace(/\.(html?|aspx?)$/i, "").replace(/[-_]+/g, " "),
      );
    const fullMenuIndex = segments.findIndex((segment) =>
      /^full menu$/i.test(segment),
    );
    const foodIndex = segments.findIndex((segment) => /^food$/i.test(segment));

    if (fullMenuIndex >= 0 && segments[fullMenuIndex + 1]) {
      return titleCase(segments[fullMenuIndex + 1]);
    }

    if (foodIndex >= 0 && segments[foodIndex + 1] && segments[foodIndex + 2]) {
      return titleCase(segments[foodIndex + 1]);
    }

    if (segments.some((segment) => /^product$/i.test(segment))) {
      return null;
    }

    const category = segments.findLast(
      (segment) =>
        !/^(us|en|menu|product|food|order|pages|content)$/i.test(segment),
    );

    return category ? titleCase(category) : null;
  } catch {
    return null;
  }
}

function isLikelyProductHref(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (
      /\/(?:events?|locations?|menus?)(?:\/|$)/.test(pathname) ||
      /\/menu\/(?:brunch|busboys|breakfast|lunch|dinner|dessert|coffee|tea|happy-hour|bar|catering|city-ridge-menu)\/?$/i.test(
        pathname,
      )
    ) {
      return false;
    }

    return (
      /\/(?:product|products|profiles|food|items?|order)\//.test(pathname) ||
      /\/menu\/[^/]+\/[^/]+/.test(pathname)
    );
  } catch {
    return false;
  }
}

function isSameSite(a, b) {
  try {
    const first = new URL(a);
    const second = new URL(b);
    return (
      first.hostname.replace(/^www\./, "") ===
      second.hostname.replace(/^www\./, "")
    );
  } catch {
    return false;
  }
}

function absolutizeUrl(value, baseUrl) {
  const cleaned = cleanText(value);

  if (!cleaned) {
    return null;
  }

  try {
    return new URL(cleaned, baseUrl).toString();
  } catch {
    return null;
  }
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function stripHashFromUrl(url) {
  return normalizeUrl(url);
}

function pickString(value) {
  if (typeof value === "string") {
    return cleanText(value);
  }

  if (value && typeof value === "object") {
    if (typeof value.name === "string") {
      return cleanText(value.name);
    }

    if (typeof value.title === "string") {
      return cleanText(value.title);
    }
  }

  return null;
}

function pickLocalizedString(value) {
  if (typeof value === "string") {
    return cleanText(value);
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    return (
      cleanText(value.en) ??
      cleanText(value.en_US) ??
      cleanText(value["en-US"]) ??
      pickString(value)
    );
  }

  return null;
}

function pickImage(value) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return pickImage(value[0]);
  }

  if (value && typeof value === "object") {
    return value.url ?? value.src ?? value.contentUrl ?? null;
  }

  return null;
}

function pickBestDescription(current, next) {
  const currentClean = cleanText(current);
  const nextClean = cleanText(next);

  if (!currentClean) {
    return nextClean;
  }

  if (!nextClean) {
    return currentClean;
  }

  if (nextClean.length > currentClean.length && nextClean.length < 320) {
    return nextClean;
  }

  return currentClean;
}

function titleCase(value) {
  return cleanText(value)
    ?.toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function similarityKey(value) {
  return cleanText(value)
    ?.toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/®|™|\*/g, "")
    .replace(/[’']/g, "")
    .replace(/[()]/g, " ")
    .replace(/\b(?:the|a|an|with|and|or|new|classic)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .join("-");
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function publishableSourceUrls(values) {
  return uniqueStrings(asArray(values).filter(isPublishableSourceUrl));
}

function isPublishableSourceUrl(value) {
  const sourceUrl = String(value ?? "").trim();

  if (!sourceUrl) {
    return false;
  }

  if (/^(?:data\/fixtures\/|\/tmp\/|https?:\/\/)/i.test(sourceUrl) === false) {
    return sourceUrl.length <= 500;
  }

  if (sourceUrl.length > 1200) {
    return false;
  }

  try {
    const parsed = new URL(sourceUrl);
    const host = parsed.hostname.toLowerCase();

    if (
      /(?:^|\.)doubleclick\.net$|(?:^|\.)googlesyndication\.com$|(?:^|\.)googleadservices\.com$|(?:^|\.)googletagmanager\.com$|(?:^|\.)google-analytics\.com$|(?:^|\.)facebook\.com$|(?:^|\.)facebook\.net$|(?:^|\.)tiktok\.com$|(?:^|\.)hotjar\.com$|(?:^|\.)sentry\.io$/i.test(
        host,
      )
    ) {
      return false;
    }

    if (
      /\/(?:activityi|collect|gtm\.js|analytics|pixel|tr|events)(?:[/?;]|$)/i.test(
        parsed.pathname,
      )
    ) {
      return false;
    }
  } catch {
    return sourceUrl.length <= 500;
  }

  return true;
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  return value === undefined || value === null ? [] : [value];
}

function uniqueBy(values, getKey) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const key = getKey(value);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(value);
  }

  return result;
}

function uniqueEvidence(values) {
  return uniqueBy(
    values.filter(
      (value) => value?.sourceUrl && isPublishableSourceUrl(value.sourceUrl),
    ),
    (value) => `${value.sourceKind}:${value.sourceUrl}:${value.text}`,
  );
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function detectContentKind(url, contentType, buffer) {
  const normalizedType = contentType.toLowerCase();
  const signature = buffer.subarray(0, 8).toString("latin1");
  const head = buffer
    .toString("utf8", 0, Math.min(buffer.length, 300))
    .trimStart();

  if (/^(?:<!doctype\s+html|<html\b)/i.test(head)) {
    return "html";
  }

  if (signature.startsWith("%PDF")) {
    return "pdf";
  }

  if (signature.startsWith("PK\u0003\u0004")) {
    return "xlsx";
  }

  if (normalizedType.includes("pdf") || /\.pdf(?:[?#]|$)/i.test(url)) {
    return "pdf";
  }

  if (
    /\.xlsx?(?:[?#]|$)/i.test(url) ||
    normalizedType.includes("spreadsheet") ||
    normalizedType.includes("excel")
  ) {
    return "xlsx";
  }

  if (normalizedType.includes("json")) {
    return "json";
  }

  if (normalizedType.includes("xml") || /\.xml(?:[?#]|$)/i.test(url)) {
    return "xml";
  }

  if (normalizedType.includes("html") || /<html\b/i.test(head)) {
    return "html";
  }

  return "text";
}

function extensionFor(url, contentType) {
  if (
    /\.pdf(?:[?#]|$)/i.test(url) ||
    contentType.toLowerCase().includes("pdf")
  ) {
    return "pdf";
  }

  if (
    /\.json(?:[?#]|$)/i.test(url) ||
    contentType.toLowerCase().includes("json")
  ) {
    return "json";
  }

  if (
    /\.xml(?:[?#]|$)/i.test(url) ||
    contentType.toLowerCase().includes("xml")
  ) {
    return "xml";
  }

  if (
    /\.xlsx?(?:[?#]|$)/i.test(url) ||
    contentType.toLowerCase().includes("spreadsheet") ||
    contentType.toLowerCase().includes("excel")
  ) {
    return "xlsx";
  }

  if (
    /\.csv(?:[?#]|$)/i.test(url) ||
    contentType.toLowerCase().includes("csv")
  ) {
    return "csv";
  }

  return "html";
}

function shortUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`.slice(0, 80);
  } catch {
    return String(url).slice(0, 80);
  }
}
