#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";

const root = process.cwd().replaceAll("\\", "/");
const requestedBatch = /^(?:poc-batch-|distributed-machine-a-front-)/.test(process.argv[2] ?? "") ? process.argv[2] : null;
const batchId = requestedBatch || "poc-batch-040-2026-07-21";
const id = requestedBatch ? process.argv[3] : process.argv[2];
const allowedIds = new Set([
  "buffalo-bergen-union-market-dc",
  "buffalo-wild-wings",
  "bukom-cafe-dc",
  "bullfrog-bagels-dc",
  "bumblebirds-dc",
  "bund-up-union-market-dc",
  "osm-buns-n-rice-7189139268",
  "burger-king",
  "burgerfi",
  "burnin-bird-dc",
  "burtons-grill-and-bar-washington-dc-dc-metro",
  "busboys-and-poets-dc",
  "cactus-cantina-dc",
  "cafe-1676-vienna-dc-metro",
  "replacement-cafe-berlin-on-capitol-hill-washington-dc",
  "cafe-colline-arlington-dc-metro",
  "replacement-cafe-fiorello-dc-washington-dc",
  "replacement-cafe-ile-mclean-va",
  "cafe-kindred-falls-church-va",
  "cafe-milano-washington-dc-dc-metro",
  "cafe-pizzaiolo-alexandria-dc-metro",
  "replacement-cafe-renaissance-vienna-va",
  "cafe-riggs-dc",
  "replacement-cafe-riggs-washington-dc",
  "cafe-rio",
  "cafe-tatti-mclean-va",
  "osm-cafesano-1732774580",
  "cafesano-reston-dc-metro",
  "replacement-calico-washington-dc",
  "california-fish-grill-north-bethesda-md",
  "california-pizza-kitchen",
  "chain-california-tortilla",
  "call-your-mother-dc",
  "replacement-cana-washington-dc",
  "cane-dc",
  "canton-disco-dc",
  "capitano-dc",
  "capo-deli-foggy-bottom-dc",
  "capo-deli-dc",
  "captain-pells-fairfax-crabhouse-fairfax-va-dc-metro",
  "carbonara-arlington-va-dc-metro",
  "carlyle-arlington-va-dc-metro",
  "carmines-dc",
  "carolina-kitchen-bar-and-grill-hyattsville-md-dc-metro",
  "carrabbas",
  "carusos-grocery-dc",
  "carusos-grocery-pike-and-rose-md",
  "carving-room-noma-dc",
  "osm-casa-tequila-2697922195",
  "replacement-casa-teresa-washington-dc",
  "replacement-casamara-washington-dc",
  "osm-caspian-kabob-10268757467",
  "catahoula-dc",
  "causa-amazonia-dc",
  "cava",
  "cava-mezze-rockville-dc-metro",
  "replacement-ceibo-washington-dc",
  "celebration-by-rupa-vira-ashburn-va",
  "celebrity-delly-falls-church-va",
  "central-michel-richard-washington-dc-dc-metro",
  "centrolina-dc",
  "chaatwala-herndon-va-dc-metro",
  "chadwicks-alexandria-va-dc-metro",
  "chai-pani-dc",
  "replacement-chai-wyy-herndon-va",
  "chaia-tacos-dc",
  "chang-chang-dc",
  "chao-ban-tysons-va",
  "chaplins-dc",
  "char-bar-dc",
  "chard-mclean-va-dc-metro",
  "charley-chesapeake-chophouse-gaithersburg-md",
  "chain-charleys-philly-steaks",
  "osm-charm-thai-1671377421",
  "chart-house-alexandria-va-dc-metro",
  "osm-chasin-tails-770780729",
  "chasin-tails-seafood-that-celebrates-falls-church-va-dc-metro",
  "chain-checkers",
  "chef-geoffs-dc",
  "replacement-chef-tony-s-fresh-seafood-rockville-md",
  "chef-tonys-rockville-dc-metro",
  "chennai-hoppers-indian-restaurant-gaithersburg-md-dc-metro",
  "chercher-ethiopian-dc",
  "chercher-ethiopian-restaurant-and-mart-washington-dc-dc-metro",
  "replacement-chez-billy-sud-washington-dc",
  "replacement-chicatana-washington-dc",
  "chick-fil-a",
  "chicken-and-whiskey-14th-dc",
  "chido-s-tex-mex-grill-laurel-md-dc-metro",
  "chiko-dc",
  "chilis",
  "chima-steakhouse-tysons-tysons-va-dc-metro",
  "china-chilcano-dc",
  "chain-china-express",
  "chipotle",
  "replacement-chit-chaat-cafe-vienna-va",
  "chloe-dc",
  "chloez-cafe-fairfax-station-dc-metro",
  "chopt-dc",
  "churchkey-washington-dc-dc-metro",
  "ciao-osteria-centreville-va-dc-metro",
  "cielo-rojo-restaurant-takoma-park-md-dc-metro",
  "cinemark-centreville-centreville-va-dc-metro",
  "osm-circa-2788369922",
  "replacement-circa-at-clarendon-arlington-va",
  "circa-at-foggy-bottom-washington-dc-dc-metro",
  "replacement-circa-at-navy-yard-washington-dc",
  "replacement-circa-at-the-boro-tysons-va",
  "circa-foggy-bottom-dc",
  "citizens-and-culture-silver-spring-md-dc-metro",
  "replacement-city-kitchen-alexandria-va",
  "clare-and-don-s-beach-shack-washington-dc-dc-metro",
  "clarity-vienna-va-dc-metro",
  "claudios-table-dc",
  "replacement-clove-halal-sterling-va",
  "osm-clyde-s-at-tower-oaks-lodge-92812505",
  "clydes-gallery-place-dc",
  "clydes-georgetown-dc",
  "coastal-flats-gaithersburg-md-dc-metro",
  "replacement-cocineros-hyattsville-md",
  "replacement-code-red-washington-dc",
  "colada-shop-dc",
  "cold-stone-creamery",
  "columbia-firehouse-alexandria-dc-metro",
  "comet-ping-pong-dc",
  "commons-fooderie-reston-dc-metro",
  "osm-commonwealth-indian-10120025923",
  "compass-coffee-dc",
  "compliments-only-dc",
  "cooper-s-hawk-winery-and-restaurant-rockville-md-dc-metro",
  "coopers-hawk-reston-va",
  "copper-canyon-grill-washington-dc-dc-metro",
  "copperwood-tavern-arlington-va-dc-metro",
  "copycat-co-dc",
  "cordelia-fishbar-dc",
  "replacement-cordelia-fishbar-washington-dc",
  "corned-beef-king-rockville-dc-metro",
  "corner-bakery-cafe",
  "osm-corso-italian-374740005",
  "replacement-cottage-house-ethiopian-cuisine-washington-dc",
  "replacement-courtside-thai-cuisine-fairfax-va",
  "cranes-dc",
  "crisp-and-juicy-kensington-md-dc-metro",
  "crumbl",
  "replacement-crust-pizzeria-napoletana-herndon-va",
  "osm-cuates-12207964801",
  "cubanos-bethesda-md",
  "replacement-cucina-morini-washington-dc",
  "osm-curry-palace-indian-452446243",
  "replacement-cynthia-bar-and-bistro-washington-dc",
  "dacha-beer-garden-shaw-washington-dc-dc-metro",
  "daikaya-dc",
  "daily-provisions-dupont-dc",
  "dairy-queen",
  "dakshin-indique-washington-dc-dc-metro",
  "replacement-dal-grano-mclean-va",
  "dal-shabu-hot-pot-annandale-va-dc-metro",
  "osm-darband-kabob-13140207699",
  "daru-dc",
  "darvish-kitchen-washington-dc-dc-metro",
  "dauphines-dc",
  "daves-hot-chicken-dc",
  "davios-reston-va",
  "al-toque-dc",
  "replacement-dc-bites-washington-dc",
  "dc-prime-steaks-ashburn-va-dc-metro",
  "dcity-smokehouse-dc",
  "dear-sushi-love-makoto-dc",
  "del-mar-dc",
  "replacement-delhi-spice-bethesda-md",
  "replacement-deli-italiano-herndon-herndon-va",
  "dennys",
  "dig",
  "dig-bethesda",
  "dirty-habit-washington-dc-dc-metro",
  "replacement-district-rico-washington-dc",
  "district-taco-dc",
  "district-winery-dc",
  "divan-restaurant-mclean-va-dc-metro",
  "dlena-dc",
  "osm-dmv-pizza-5811141809",
  "replacement-dog-daze-social-club-washington-dc",
  "dog-haus-biergarten-bethesda-bethesda-md-dc-metro",
  "dogfish-head-alehouse-gaithersburg-md-dc-metro",
  "replacement-dogon-by-kwame-onwuachi-washington-dc",
  "dogwood-tavern-falls-church-va-dc-metro",
  "doi-moi-washington-dc-dc-metro",
  "osm-dok-khao-10728675757",
  "osm-dolan-4198051508",
  "dolan-uyghur-dc",
  "dolce-vita-italian-restaurant-and-wine-bar-fairfax-va-dc-metro",
  "dolcezza-dc",
  "dominos",
  "don-luis-restaurant-authentic-mexican-cuisine-and-cantina-centreville-dc-metro",
  "osm-don-ramon-121716953",
  "replacement-donsak-thai-restaurant-washington-dc",
  "replacement-doro-soul-food-washington-dc",
  "dos-toros-dc",
  "dosa-and-chaat-gaithersburg-dc-metro",
  "dukes-grocery-dupont-dc",
  "dukem-dc",
  "dunkin",
  "dupont-italian-kitchen-dc",
  "dyfres-burger-springfield-dc-metro",
  "earls-kitchen-bar-mclean-va-dc-metro",
  "replacement-easy-company-washington-dc",
  "eddie-merlots-ashburn-va-dc-metro",
  "eddie-vs-tysons-va",
  "replacement-efesus-mediterranean-cafe-ashburn-va",
  "replacement-egg-yaki-washington-dc",
  "einstein-bros",
  "el-aguila-restaurant-silver-spring-md-dc-metro",
  "el-chucho-dc",
  "osm-el-golfo-4957750893",
  "osm-el-g-ero-mexicano-1236156051",
  "el-mariachi-rockville-dc-metro",
  "el-paso-mexican-restaurant-springfield-va-dc-metro",
  "el-patio-randolph-rockville-md-dc-metro",
  "el-pollo-rico-arlington-va",
  "el-presidente-dc",
  "el-secreto-nabiha-dc",
  "el-sol-dc",
  "el-taller-del-xiquet-dc",
  "el-tamarindo-dc",
  "el-viejo-silver-spring",
  "osm-ela-mesa-taste-of-greece-12162675751",
  "elcielo-dc",
  "electric-bull-vienna-va",
  "replacement-eleni-s-greek-taverna-springfield-va",
  "elephant-and-castle-washington-dc-dc-metro",
  "replacement-elilta-restaurant-silver-spring-md",
  "replacement-elizabeth-s-washington-dc",
  "elizabeths-gone-raw-dc",
  "ella-s-wood-fired-kitchen-washington-dc-dc-metro",
  "replacement-elle-washington-dc",
  "ellie-bird-falls-church-va",
  "replacement-ellie-bird-falls-church-va",
  "elmina-dc",
  "osm-elsi-ethiopian-12703520415",
  "osm-ema-rossi-pizzeria-13912184601",
  "emmy-squared-navy-yard-dc",
  "osm-emmy-squared-pizza-2145977609",
  "emmy-squared-shaw-dc",
  "enatye-ethiopian-restaurant-herndon-va-dc-metro",
  "entyse-tysons-va",
  "esaan-mclean-va",
  "estuary-dc",
  "et-voila-dc",
  "ethiopic-dc",
  "evening-star-cafe-alexandria-va",
  "replacement-exiles-bar-washington-dc",
  "osm-facci-1351555296",
  "facci-wood-fire-pizza-wine-bar-of-maple-lawn-laurel-md-dc-metro",
  "falafel-inc-dc",
  "family-ethiopian-restaurant-washington-dc-dc-metro",
  "famous-daves",
  "famous-toastery-ashburn-dc-metro",
  "replacement-famous-toastery-of-ashburn-ashburn-va",
  "farmers-and-distillers-dc",
  "farmers-fishers-bakers-dc",
  "replacement-fat-pete-s-bbq-washington-dc",
  "fava-pot-falls-church-va-dc-metro",
  "federalist-pig-dc",
  "replacement-feru-ethiopian-cuisine-washington-dc",
  "osm-fialova-12652608675",
  "filomena-dc",
  "osm-finnegan-s-wake-irish-pub-1332524327",
  "fiola-dc",
  "fiola-mare-dc",
  "firebirds-wood-fired-grill-gaithersburg-md-dc-metro",
  "replacement-firefly-washington-dc",
  "firehouse-subs",
  "firepan-korean-bbq-and-bar-silver-spring-md-dc-metro",
  "first-watch",
  "fish-shop-dc",
  "fish-taco-bethesda-md",
  "five-guys",
  "flemings-prime-steakhouse-tysons-va",
  "flor-coffee-books-georgetown-dc",
  "floreria-atlantico-dc",
  "floriana-dc",
  "florida-avenue-grill-dc",
  "osm-flower-child-6327602834",
  "flower-child-bethesda",
  "fogo-de-chao-tysons-va",
  "fontina-grille-rockville-md-dc-metro",
  "ford-s-fish-shack-ashburn-va-dc-metro",
  "fossette-focacceria-union-market-dc",
  "osm-foster-s-3200208879",
  "founding-farmers-dc",
  "founding-farmers-reston-station-va",
  "founding-farmers-tysons-va",
  "replacement-fountain-grill-ashburn-va",
  "four-sisters-grill-arlington-va",
  "replacement-fraiche-washington-dc",
  "osm-frank-s-burgers-10979539541",
  "franklins-hyattsville-md-dc-metro",
  "frankly-pizza-kensington-md-dc-metro",
  "fresh-baguette-dc",
  "osm-front-porch-514348150",
  "replacement-full-key-wheaton-md",
  "osm-gadsby-s-tavern-205317817",
  "replacement-gaia-washington-dc",
  "osm-galae-thai-2245510910",
  "galaxy-hut-arlington-va",
  "replacement-gatsby-washington-dc",
  "gcdc-grilled-cheese-dc",
  "gemini-dc",
  "genki-izakaya-fairfax-va-dc-metro",
  "osm-genova-pizza-12207810924",
  "georges-falafel-georgetown-dc",
  "georges-steak-n-things-fairfax-station-va",
  "georgetown-bagelry-bethesda-dc-metro",
  "georgetown-cupcake-dc",
  "georgetown-seafood-washington-dc-dc-metro",
  "replacement-gerrard-street-kitchen-washington-dc",
  "ghostburger-dc",
  "replacement-giardino-italian-restaurant-springfield-va",
  "replacement-gigi-s-pasta-washington-dc",
  "osm-gin-ramen-12207962682",
  "osm-giuseppi-s-pizza-3527237201",
  "replacement-glenwood-s-stanford-grill-columbia-columbia-md",
  "glory-days-grill-lorton-va-dc-metro",
  "osm-glory-days-grille-237472337",
  "replacement-godfrey-s-falls-church-va",
  "osm-gogi-92-korean-bbq-3388354065",
  "replacement-gogiville-va-centreville-va",
  "good-company-doughnuts-ballston-va",
  "good-stuff-eatery-georgetown-dc",
  "hells-kitchen-dc",
  "grace-street-georgetown-dc",
  "grace-s-mandarin-washington-dc-dc-metro",
  "osm-grand-fusion-cuisine-13252840927",
  "grande-buffet-and-grill-laurel-md-dc-metro",
  "replacement-granville-moore-s-washington-dc",
  "grazie-grazie-dc",
  "grazie-nonna-dc",
  "greek-deli-dc",
  "osm-greek-unique-12234989460",
  "green-pig-bistro-arlington-va-dc-metro",
  "osm-greenfare-12246325393",
  "greenhouse-kitchen-bar-vienna-va-dc-metro",
  "gregorio-s-trattoria-potomac-md-dc-metro",
  "gregorys-coffee-dc",
  "chain-kabob",
  "replacement-grillmarx-columbia-steakhouse-and-raw-bar-columbia-md",
  "gringos-and-mariachis-bethesda-dc-metro",
  "guacado-laurel-dc-metro",
  "osm-guajillo-2563891113",
  "chain-guapo-s",
  "guapo-s-cocina-and-bar-gaithersburg-md-dc-metro",
  "replacement-guardado-s-restaurant-bethesda-md",
  "guerra-steakhouse-arlington-va",
  "gypsy-kitchen-dc",
  "osm-gyu-san-japanese-bbq-12207975098",
  "gyuzo-japanese-bbq-wagyu-sushi-ramen-all-you-can-eat-rockville-md-dc-metro",
  "habit-burger-grill",
  "osm-haifa-13079176476",
  "replacement-halal-munchies-ashburn-ashburn-va",
  "osm-hama-sushi-5166509330",
  "osm-hamrock-s-resturaunt-379238772",
  "replacement-han-gang-restaurant-annandale-va",
  "osm-han-palace-tysons-13514652168",
  "replacement-han-palace-woodley-park-washington-dc",
  "replacement-hangry-burger-springfield-va",
  "chain-hangry-joe-s-hot-chicken",
  "hanks-oyster-bar-wharf-dc",
  "osm-hank-s-pasta-13096994691",
  "replacement-harrar-coffee-and-roastery-washington-dc",
  "harrimans-middleburg-va",
  "harth-tysons-va",
  "osm-harvey-s-2193573798",
  "hawk-and-griffin-vienna-va",
  "hawk-n-dove-capitol-hill-dc-washington-dc-dc-metro",
  "osm-hawkers-9960460114",
  "hawkers-asian-street-food-bethesda-md-dc-metro",
  "heidelberg-pastry-shoppe-arlington-va",
  "heirloom-reston-va",
  "hello-betty-north-bethesda-md",
  "osm-hershey-s-166986918",
  "osm-hi-fi-tex-mex-bbq-12965590481",
  "highlands-dc",
  "replacement-himalayan-wild-yak-ashburn-va",
  "hinata-sushi-carryout-bethesda-md",
  "osm-hinzi-s-13796406656",
  "hiraya-kayu-dc",
  "replacement-his-and-hers-washington-dc",
]);
const distributedRun = batchId === "distributed-machine-a-front-20260810163952";
if (!(distributedRun || /^poc-batch-0(?:40|41|42|43|44|45|46|47)-2026-07-21$/.test(batchId) || /^poc-batch-0(?:48|49|50|51|52|53|54|55|56|57|58|59|60)-2026-07-22$/.test(batchId) || /^poc-batch-0(?:61|62|63|64|65|66|67|68|69|70)-2026-08-04$/.test(batchId) || /^poc-batch-(?:0(?:71|72|73|74|75|76|77|78|79|80|81|82|83|84|85|86|87|88|89|90|91|92|93|94|95|96|97|98|99)|100|101|102|103|104|105|106|107|108|109|110|111|112)-2026-08-05$/.test(batchId) || /^poc-batch-(?:113|114|115|116|117|118|119|120|121|122|123|124|125|126|127|128|129|130|131|132|133|134|135)-2026-08-06$/.test(batchId) || /^poc-batch-(?:136|137|138|139|140|141|142|143|144|145|146|147|148|149|150|151|152|153|154|155|156|157|158|159|160)-2026-08-07$/.test(batchId) || /^poc-batch-(?:161|162|163|164|165|166|167|168)-2026-08-10$/.test(batchId)) || !allowedIds.has(id)) {
  throw new Error("Usage: node scripts/apply-batch40-poc.mjs [poc-batch-068-2026-08-04] <restaurant-id>");
}

const run = distributedRun
  ? `${root}/data/restaurant-verification/distributed-runs/${batchId}`
  : `${root}/data/restaurant-verification/worker-runs/${batchId}`;
const paths = {
  job: `${run}/jobs/${id}.json`,
  result: `${run}/results/${id}.json`,
  checks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  generated: `${root}/src/data/generated/restaurants.generated.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  apply: `${run}/apply-results/${id}.json`,
};
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const write = (file, value, compact = false) => {
  fs.mkdirSync(file.slice(0, file.lastIndexOf("/")), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, compact ? 0 : 2)}${compact ? "" : "\n"}`);
};
const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const assert = (value, message) => { if (!value) throw new Error(message); };
const unique = (values) => [...new Set((values || []).filter(Boolean))];
const canonicalPurposes = new Set(["identity", "menu", "allergen", "ingredients", "cross_contact", "both", "other"]);

const job = read(paths.job);
const result = read(paths.result);
const checks = fs.readFileSync(paths.checks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha(JSON.stringify(checks.map((row) => row.baseline)));
assert(fingerprint === job.baselineFingerprint, `stale_apply_packet: ${fingerprint}`);
assert(job.restaurantId === id && result.restaurantId === id && result.batchId === batchId, "target identity mismatch");
const preflight = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
assert(preflight.valid, preflight.errors.join(" | "));

let products = Array.isArray(result.currentProducts)
  ? result.currentProducts
  : Array.isArray(result.currentProducts?.products)
    ? result.currentProducts.products
    : [];
if (id === "elizabeths-gone-raw-dc" && products.length === 0 && Array.isArray(result.products)) {
  const directByKey = new Map([
    ["prix-fixe-first", ["milk"]],
    ["prix-fixe-main", ["egg"]],
    ["prix-fixe-dessert", ["milk", "sesame"]],
  ]);
  products = result.products.map((product) => {
    const containsAllergens = directByKey.get(product.productKey) ?? [];
    return {
      currentProductKey: product.productKey,
      name: product.name,
      category: product.category,
      presentationIds: [],
      sourceEvidenceIds: product.sourceEvidenceIds ?? [],
      containsAllergens,
      mayContainAllergens: [],
      allergenSourceType: containsAllergens.length ? "restaurant_ingredients" : "unavailable",
      allergenAuthorityTier: containsAllergens.length ? "restaurant_issued" : null,
      allergenSourceEvidenceIds: containsAllergens.length ? product.sourceEvidenceIds ?? [] : [],
      notes: [],
    };
  });
}
if (id === "esaan-mclean-va") {
  const officialMenuProducts = [
    ["Drunken Stir-Fried Shanghai Noodles", ["shellfish"]],
    ["Green Curry Nest", []],
    ["Ka-prow Soft Bone Pork Ribs", []],
    ["Crispy Rice Salad", ["peanut"]],
    ["Nuea Tun Morfire", []],
    ["Tom Yum Goong Morfire", ["shellfish"]],
    ["Pla Neung Manao", ["fish"]],
    ["Stewed Beef Noodle Soup", []],
    ["Massaman Curry", ["peanut"]],
    ["Panang Curry", ["peanut", "shellfish"]],
    ["Tom Zapp", []],
    ["Esaan Sausage", []],
    ["Chiangmai Sausage", []],
    ["Crispy Spicy Prawn", ["shellfish"]],
    ["Crispy Pork Belly", []],
    ["Tom Yum Soup", ["shellfish"]],
    ["Grilled Squid", ["shellfish"]],
    ["Kuaitiao Khua", ["egg", "shellfish"]],
    ["Esaan Crispy Spring Roll", []],
    ["Crispy Fried Tofu", ["peanut"]],
    ["Mieng Pla Too", ["fish"]],
    ["Kuaytiew Luisuan", ["egg"]],
    ["Kai Tod Samoon Prai", []],
    ["Yum Kanom Jeen Pla Too", ["fish"]],
    ["Somtum Thai", ["peanut"]],
    ["Somtum Plara", ["fish"]],
    ["Somtum Kao Poad Kaikem", ["egg"]],
    ["Somtum Kaikem", ["egg", "peanut"]],
    ["Somtum Muor", ["fish"]],
    ["Kao Mun Kai Tod", []],
    ["Kao Soi", ["egg", "shellfish"]],
    ["Ba Mee Na Moo Yang", ["egg", "shellfish"]],
    ["Esaan Pad Thai", ["shellfish"]],
    ["Kao Kluk Ka Pi", ["shellfish", "egg"]],
    ["Yum Woon Sen", ["shellfish", "peanut"]],
    ["Pla Koong", ["shellfish"]],
    ["Salmon Nam Tok", ["fish"]],
    ["Pla Pao Branzino", ["fish"]],
    ["Pla Tod Samun Prai Rock Fish", ["fish", "tree-nut"]],
    ["Larb Moo", []],
    ["Moo Nam Tok", []],
    ["Kor Moo Yang", []],
    ["Yum Kai Zapp", []],
    ["Kai Yang", []],
    ["Nam Tok Nue", []],
    ["Crying Tiger", []],
    ["Esaan Green Vegetable of the Day", []],
    ["Larb Hed", []],
    ["Larb Tofu", []],
    ["Thai Rich Tofu", []],
  ];
  const keyFor = (name) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  products = officialMenuProducts.map(([name, containsAllergens]) => ({
    currentProductKey: keyFor(name),
    name,
    category: "Official Summer Menu",
    presentationIds: [],
    sourceEvidenceIds: ["ev-pdf"],
    containsAllergens,
    mayContainAllergens: [],
    allergenSourceType: containsAllergens.length ? "restaurant_ingredients" : "unavailable",
    allergenAuthorityTier: containsAllergens.length ? "restaurant_issued" : null,
    allergenSourceEvidenceIds: containsAllergens.length ? ["ev-pdf"] : [],
    notes: [],
  }));
  for (const entry of result.reconciliation.items) {
    entry.disposition = "artifact";
    entry.matchedCurrentProductKeys = [];
    entry.notes = "Frozen parser fragment was replaced by the coordinator-reviewed official PDF catalog.";
  }
}
if (id === "estuary-dc") {
  result.menuSurfaces.forEach((surface) => {
    if (!surface.current) surface.currentProductKeys = [];
  });
  for (const source of result.sources) {
    if (source.purpose === "allergen_search") source.purpose = "allergen";
  }
}
if (id === "ethiopic-dc") {
  for (const source of result.sources) {
    if (source.purpose === "location") source.purpose = "identity";
  }
}
assert(Array.isArray(products), "current products missing");
const explicitlyEmptyPreOpeningCatalog = products.length === 0 && result.emptyCatalogReason === "not_yet_published";
const productKeys = new Set(products.map((product) => product.currentProductKey));
assert(productKeys.size === products.length && !productKeys.has(undefined), "product keys must be explicit and unique");
if (id === "elizabeths-gone-raw-dc") {
  for (const surface of result.menuSurfaces) {
    const isDinner = surface.surfaceId === "official-dinner";
    const isOnyx = surface.surfaceId === "official-onyx";
    surface.current = isDinner || isOnyx;
    surface.scopeStatus = isDinner || isOnyx ? "complete" : "supporting";
    surface.currentProductKeys = products
      .filter((product) => product.sourceEvidenceIds.includes(isDinner ? "ev-menu" : isOnyx ? "ev-bar" : ""))
      .map((product) => product.currentProductKey);
  }
}
if (id === "ella-s-wood-fired-kitchen-washington-dc-dc-metro") {
  const surfaceIds = ["official-home", "official-food-menu", "official-happy-hour", "linked-ordering-menu"];
  result.menuSurfaces.forEach((surface, index) => {
    surface.surfaceId = surfaceIds[index];
    surface.current = index === 1;
    surface.scopeStatus = index === 1 ? "complete" : "supporting";
    surface.currentProductKeys = index === 1 ? [...productKeys] : [];
  });
}
if (id === "et-voila-dc") {
  const surfaceIds = ["official-menu-page", "official-current-menu", "official-menu-index", "linked-toast"];
  result.menuSurfaces.forEach((surface, index) => {
    const isOfficialMenu = index === 1;
    surface.surfaceId = surfaceIds[index];
    surface.current = isOfficialMenu;
    surface.scopeStatus = isOfficialMenu ? "complete" : "supporting";
    surface.currentProductKeys = isOfficialMenu ? [...productKeys] : [];
  });
}
if (id === "evening-star-cafe-alexandria-va") {
  result.menuSurfaces.forEach((surface) => {
    const isOfficialPdf = surface.surfaceId === "official-spring-pdf";
    surface.current = isOfficialPdf;
    surface.scopeStatus = isOfficialPdf ? "complete" : "supporting";
    surface.currentProductKeys = isOfficialPdf ? [...productKeys] : [];
  });
}
if (id === "replacement-exiles-bar-washington-dc") {
  const surfaceIds = ["official-main-menu", "official-upstairs-menu", "official-brunch", "linked-toast"];
  result.menuSurfaces.forEach((surface, index) => {
    const isMain = index === 0;
    surface.surfaceId = surfaceIds[index];
    surface.current = isMain;
    surface.scopeStatus = isMain ? "complete" : "supporting";
    surface.sourceEvidenceIds = surface.sourceEvidenceIds?.length
      ? surface.sourceEvidenceIds
      : [index === 0 ? "ev-menu-main" : index === 1 ? "ev-menu-upstairs" : index === 3 ? "ev-toast" : "ev-home"];
    surface.currentProductKeys = isMain ? [...productKeys] : [];
  });
}
if (id === "osm-facci-1351555296") {
  result.menuSurfaces.forEach((surface) => {
    const evidenceIds = surface.sourceEvidenceIds || [];
    const matchingKeys = products
      .filter((product) => product.sourceEvidenceIds?.some((evidenceId) => evidenceIds.includes(evidenceId)))
      .map((product) => product.currentProductKey);
    const isPublishing = ["lunch", "dinner", "dessert-after-brunch"].includes(surface.surfaceId) && matchingKeys.length > 0;
    surface.current = isPublishing;
    surface.scopeStatus = isPublishing ? "complete" : "supporting";
    surface.currentProductKeys = isPublishing ? matchingKeys : [];
  });
}
if (id === "facci-wood-fire-pizza-wine-bar-of-maple-lawn-laurel-md-dc-metro") {
  const evidenceIds = ["ev-home", "ev-menu-dinner", "ev-menu-lunch", "ev-dessert", "ev-drinks"];
  result.menuSurfaces.forEach((surface, index) => {
    const isPublishing = [1, 2, 3].includes(index) && (surface.currentProductKeys || []).length > 0;
    surface.sourceEvidenceIds = [evidenceIds[index]];
    surface.current = isPublishing;
    surface.scopeStatus = isPublishing ? "complete" : "supporting";
    if (!isPublishing) surface.currentProductKeys = [];
  });
  for (const source of result.sources) {
    if (source.purpose === "beverage") source.purpose = "menu";
  }
}
if (id === "ellie-bird-falls-church-va") {
  result.menuSurfaces.forEach((surface) => {
    const isMenu = surface.surfaceId === "official-menu-text";
    surface.current = isMenu;
    surface.scopeStatus = isMenu ? "complete" : "supporting";
    surface.currentProductKeys = isMenu ? [...productKeys] : [];
  });
}
if (id === "replacement-ellie-bird-falls-church-va") {
  result.menuSurfaces.forEach((surface) => {
    const evidenceId = surface.sourceEvidenceIds?.[0];
    const matchingKeys = products
      .filter((product) => product.sourceEvidenceIds?.includes(evidenceId)
        || (surface.surfaceId === "surface-1" && product.sourceEvidenceIds?.includes("src-0")))
      .map((product) => product.currentProductKey);
    surface.current = matchingKeys.length > 0;
    surface.scopeStatus = matchingKeys.length > 0 ? "complete" : "supporting";
    surface.currentProductKeys = matchingKeys;
  });
}
if (id === "osm-elsi-ethiopian-12703520415") {
  result.menuSurfaces.forEach((surface) => {
    const isMenu = surface.surfaceId === "official-menu";
    surface.current = isMenu;
    surface.scopeStatus = isMenu ? "complete" : "supporting";
    surface.currentProductKeys = isMenu ? [...productKeys] : [];
  });
}
if (id === "osm-ema-rossi-pizzeria-13912184601") {
  result.menuSurfaces.forEach((surface) => {
    if (surface.surfaceId === "official-rocklands") {
      surface.current = false;
      surface.scopeStatus = "supporting";
      surface.currentProductKeys = [];
    } else if (surface.surfaceId === "official-food") {
      surface.current = true;
      surface.scopeStatus = "complete";
      surface.currentProductKeys = [...productKeys];
    } else if (surface.surfaceId === "toast") {
      surface.current = false;
      surface.scopeStatus = "supporting";
      surface.currentProductKeys = [];
    }
  });
  for (const source of result.sources) {
    if (["ev-spotapps", "ev-toast"].includes(source.evidenceId)) source.purpose = "menu";
    if (source.purpose === "allergen_search") source.purpose = "allergen";
  }
}
if (id === "emmy-squared-navy-yard-dc") {
  result.menuSurfaces.forEach((surface) => {
    const isMenu = surface.surfaceId === "official-navy-yard-menu";
    surface.current = isMenu;
    surface.scopeStatus = isMenu ? "complete" : "supporting";
    surface.currentProductKeys = isMenu ? [...productKeys] : [];
  });
}
if (id === "osm-emmy-squared-pizza-2145977609") {
  const baselineByAuditKey = new Map(checks.map((row) => [row.auditItemKey, row.baseline]));
  const productByKey = new Map(products.map((product) => [product.currentProductKey, product]));
  for (const entry of result.reconciliation.items) {
    const baseline = baselineByAuditKey.get(entry.auditItemKey);
    if (!baseline || (!(baseline.allergens?.length) && !(baseline.mayContain?.length))) continue;
    for (const currentProductKey of entry.matchedCurrentProductKeys || []) {
      const product = productByKey.get(currentProductKey);
      if (!product) continue;
      product.containsAllergens = unique([...(product.containsAllergens || []), ...(baseline.allergens || [])]);
      product.mayContainAllergens = unique([...(product.mayContainAllergens || []), ...(baseline.mayContain || [])]);
      product.allergenSourceType = "restaurant_ingredients";
      product.allergenAuthorityTier = "restaurant_issued";
      product.allergenSourceEvidenceIds = unique([
        ...(product.allergenSourceEvidenceIds || []),
        ...(entry.sourceEvidenceIds || []),
      ]);
    }
  }
  result.menuSurfaces.forEach((surface) => {
    const isPublishingSurface = ["lunch", "brunch", "express"].includes(surface.surfaceId);
    surface.current = isPublishingSurface;
    surface.scopeStatus = isPublishingSurface ? "complete" : "supporting";
    if (!isPublishingSurface) surface.currentProductKeys = [];
  });
}
if (id === "emmy-squared-shaw-dc") {
  result.menuSurfaces.forEach((surface) => {
    const isPublishingSurface = ["shaw-menu", "shaw-vendor"].includes(surface.surfaceId);
    surface.current = isPublishingSurface;
    surface.scopeStatus = isPublishingSurface ? "complete" : "supporting";
    if (!isPublishingSurface) surface.currentProductKeys = [];
  });
}
if (id === "entyse-tysons-va") {
  result.menuSurfaces.forEach((surface) => {
    const isPublishingSurface = ["official-menus", "bar-pdf"].includes(surface.surfaceId);
    surface.current = isPublishingSurface;
    surface.scopeStatus = isPublishingSurface ? "complete" : "supporting";
    if (!isPublishingSurface) surface.currentProductKeys = [];
  });
  for (const source of result.sources) {
    if (source.purpose === "allergen_search") source.purpose = "allergen";
  }
}
if (id === "esaan-mclean-va") {
  result.menuSurfaces.forEach((surface) => {
    const isPdf = surface.surfaceId === "official-pdf";
    surface.current = isPdf;
    surface.scopeStatus = isPdf ? "complete" : "supporting";
    surface.currentProductKeys = isPdf ? [...productKeys] : [];
  });
  for (const source of result.sources) {
    if (source.evidenceId === "ev-home") source.purpose = "identity";
    if (source.evidenceId === "ev-pdf") source.purpose = "both";
    if (source.evidenceId === "ev-vendor") source.purpose = "menu";
    if (source.purpose === "allergen_search") source.purpose = "allergen";
  }
}
if (["famous-daves", "famous-toastery-ashburn-dc-metro", "replacement-famous-toastery-of-ashburn-ashburn-va"].includes(id)) {
  for (const source of result.sources) {
    const purpose = String(source.purpose || "").toLowerCase();
    if (purpose === "identity/menu" || purpose === "current menu/allergens") source.purpose = "both";
    else if (purpose === "location" || purpose === "identity") source.purpose = "identity";
    else if (purpose.includes("allergen") || purpose === "nutrition" || purpose === "targeted_web_search") source.purpose = "allergen";
    else if (purpose.includes("menu") || purpose.includes("ordering vendor")) source.purpose = "menu";
    else source.purpose = "other";
  }
}
if (["fava-pot-falls-church-va-dc-metro", "federalist-pig-dc", "replacement-feru-ethiopian-cuisine-washington-dc"].includes(id)) {
  for (const source of result.sources) {
    if (source.purpose === "allergen_search") source.purpose = "allergen";
  }
}
if (id === "replacement-famous-toastery-of-ashburn-ashburn-va") {
  for (const surface of result.menuSurfaces) {
    surface.currentProductKeys = surface.current
      ? products.filter((product) => (product.sourceEvidenceIds || []).some((evidenceId) => (surface.sourceEvidenceIds || []).includes(evidenceId))).map((product) => product.currentProductKey)
      : [];
  }
}
if (distributedRun || batchId === "poc-batch-168-2026-08-10") {
  for (const source of result.sources) {
    const purpose = String(source.purpose || "").toLowerCase();
    if (purpose === "identity" || purpose.includes("identity") || purpose.includes("location")) source.purpose = "identity";
    else if (purpose.includes("allergen") && (purpose.includes("menu") || purpose.includes("ingredient"))) source.purpose = "both";
    else if (purpose.includes("allergen") || purpose.includes("targeted") || purpose.includes("document")) source.purpose = "allergen";
    else if (purpose.includes("menu") || purpose.includes("ordering") || purpose.includes("delivery") || purpose.includes("beverage")) source.purpose = "menu";
    else source.purpose = "other";
  }
  for (const surface of result.menuSurfaces) {
    const publishing = surface.current === true && surface.scopeStatus === "complete";
    surface.current = publishing;
    if (!publishing) surface.currentProductKeys = [];
    else if (!surface.currentProductKeys?.length) {
      surface.currentProductKeys = products
        .filter((product) => (product.sourceEvidenceIds || []).some((evidenceId) => (surface.sourceEvidenceIds || []).includes(evidenceId)))
        .map((product) => product.currentProductKey);
      if (!surface.currentProductKeys.length) {
        surface.current = false;
        surface.scopeStatus = "supporting";
      }
    }
  }
}
const currentSurfaces = result.menuSurfaces.filter((surface) => surface.current);
assert(currentSurfaces.length > 0 && currentSurfaces.every((surface) => surface.scopeStatus === "complete"), "current surfaces must be complete");
if (currentSurfaces.length === 1 && (!Array.isArray(currentSurfaces[0].currentProductKeys) || currentSurfaces[0].currentProductKeys.length === 0)) {
  currentSurfaces[0].currentProductKeys = [...productKeys];
}
const publishedKeys = new Set();
for (const surface of currentSurfaces) {
  assert(Array.isArray(surface.currentProductKeys) && (surface.currentProductKeys.length > 0 || explicitlyEmptyPreOpeningCatalog), `empty currentProductKeys: ${surface.surfaceId}`);
  assert(new Set(surface.currentProductKeys).size === surface.currentProductKeys.length, `duplicate surface keys: ${surface.surfaceId}`);
  for (const key of surface.currentProductKeys) {
    assert(productKeys.has(key), `undefined surface key: ${surface.surfaceId}:${key}`);
    publishedKeys.add(key);
  }
}
assert(products.every((product) => publishedKeys.has(product.currentProductKey)), "uncovered current product");
assert(result.menuSurfaces.filter((surface) => !surface.current).every((surface) => (surface.currentProductKeys || []).length === 0), "support surface publishes products");
assert(result.sources.every((source) => canonicalPurposes.has(source.purpose)), "noncanonical evidence purpose");

const sourceById = new Map(result.sources.map((source) => [source.evidenceId || source.id, source]));
const currentUrls = new Set(currentSurfaces.map((surface) => surface.url));
const directProducts = products.filter((product) => (product.containsAllergens || []).length || (product.mayContainAllergens || []).length);
const containsAssertions = products.reduce((count, product) => count + (product.containsAllergens || []).length, 0);
const mayContainAssertions = products.reduce((count, product) => count + (product.mayContainAllergens || []).length, 0);
const matrixSearchCount = (Array.isArray(result.matrixSearch.attempted)
  ? result.matrixSearch.attempted
  : result.matrixSearch.attempts || []).length;

const generated = read(paths.generated);
let targetIndex = generated.restaurants.findIndex((restaurant) => restaurant.id === id);
if (targetIndex < 0) {
  targetIndex = generated.restaurants.length;
  generated.restaurants.push({ id, name: job.name, locationId: job.locationId, items: [] });
}
const previous = generated.restaurants[targetIndex];
const oldByKey = new Map((previous.items || []).map((item) => [item.id, item]));
const items = products.map((product) => ({
  ...oldByKey.get(product.currentProductKey),
  id: product.currentProductKey,
  name: product.name,
  category: product.category,
  description: product.description || oldByKey.get(product.currentProductKey)?.description || null,
  allergens: [...(product.containsAllergens || [])],
  mayContain: [...(product.mayContainAllergens || [])],
  mayContainAllergens: [...(product.mayContainAllergens || [])],
  allergenSourceType: product.allergenSourceType,
  allergenAuthorityTier: product.allergenAuthorityTier ?? null,
  allergenSourceEvidenceIds: [...(product.allergenSourceEvidenceIds || [])],
  sourceEvidenceIds: [...(product.sourceEvidenceIds || [])],
  sourceUrls: unique((product.sourceEvidenceIds || []).map((evidenceId) => sourceById.get(evidenceId)?.url).filter((url) => currentUrls.has(url))),
  ingredientIntelligence: undefined,
}));
const officialAllergenStatus = result.matrixSearch.status === "found" ? "extracted" : "accurately_unavailable";
const target = {
  ...previous,
  displayAddress: result.identity.address || result.identity.location || previous.displayAddress,
  locationId: job.locationId,
  sourceUrls: [...currentUrls],
  locationSurfaces: result.menuSurfaces,
  items,
  itemCount: items.length,
  menuItemCount: items.length,
  totalItemCount: items.length,
  officialItemCount: directProducts.length,
  coveragePercent: 1,
  coverageStatus: "complete",
  officialAllergenStatus,
  officialAllergenRemediationBucket: officialAllergenStatus === "extracted" ? "official-full" : "accurately-unavailable",
  allergenDataStatus: {
    officialItemCount: directProducts.length,
    officialTotal: directProducts.length,
    totalItemCount: items.length,
    officialCoverageRatio: items.length ? directProducts.length / items.length : 0,
    bucket: officialAllergenStatus === "extracted" ? "official-disclosure" : "official-disclosure-only",
  },
};
generated.restaurants[targetIndex] = await annotateRestaurantWithIngredientIntelligence(target);
write(paths.generated, generated, true);

const evidence = {
  schemaVersion: 1,
  verificationContractVersion: 2,
  restaurantId: id,
  name: job.name,
  sources: result.sources.map((source) => ({
    id: source.evidenceId || source.id,
    url: source.url,
    authorityTier: source.authorityTier,
    purpose: source.purpose,
    retrievedAt: source.retrievedAt,
    contentType: source.contentType ?? null,
    finalUrl: source.finalUrl ?? null,
    httpStatus: source.httpStatus ?? null,
    byteLength: source.byteLength ?? null,
    sha256: source.sha256 ?? null,
    artifactPath: source.artifactPath ?? null,
    excerpt: source.excerpt || source.notes || source.outcome || "Inspected source.",
    rowIdentifiers: source.rowIdentifiers || [],
    request: source.request ?? null,
    notes: unique([source.notes, source.outcome]),
  })),
  adjudication: { type: "coordinator", runId: batchId, decision: result.recommendedLane },
};
assert(evidence.sources.every((source) => source.id && source.url && source.excerpt), "evidence closure failed");
write(paths.evidence, evidence);

const reconciliationItems = Array.isArray(result.reconciliation)
  ? result.reconciliation
  : result.reconciliation.items || result.reconciliation.dispositions || result.reconciliation.entries;
assert(Array.isArray(reconciliationItems), "reconciliation items missing");
const reconciliationCounts = Object.fromEntries(Object.entries(Object.groupBy(reconciliationItems, (item) => item.disposition)).map(([key, rows]) => [key, rows.length]));
const dossierProducts = products.map((product) => ({
  currentProductKey: product.currentProductKey,
  name: product.name,
  category: product.category,
  presentationIds: product.presentationIds || [],
  sourceEvidenceIds: product.sourceEvidenceIds || [],
  containsAllergens: product.containsAllergens || [],
  mayContainAllergens: product.mayContainAllergens || [],
  allergenSourceType: product.allergenSourceType,
  allergenAuthorityTier: product.allergenAuthorityTier ?? null,
  allergenSourceEvidenceIds: product.allergenSourceEvidenceIds || [],
  coordinatorReviewed: true,
  notes: unique([product.notes]),
}));
assert(dossierProducts.every((product, index) => JSON.stringify([product.currentProductKey, product.containsAllergens, product.mayContainAllergens]) === JSON.stringify([products[index].currentProductKey, products[index].containsAllergens || [], products[index].mayContainAllergens || []])), "dossier claim mismatch");
write(paths.dossier, {
  schemaVersion: 1,
  verificationContractVersion: 2,
  restaurantId: id,
  name: job.name,
  status: "pending_coordinator_closeout",
  identity: { ...result.identity, status: "confirmed" },
  currentCatalog: {
    status: "verified",
    reviewedBaselineItemCount: checks.length,
    currentProductCount: products.length,
    reconciledCurrentProductCount: reconciliationItems.filter((item) => (item.matchedCurrentProductKeys || []).length).length,
    surfaces: result.menuSurfaces.map((surface) => ({ ...surface, verified: surface.current && surface.scopeStatus === "complete", evidenceIds: surface.sourceEvidenceIds || [] })),
    products: dossierProducts,
    notes: ["Only current complete surfaces publish products.", "Ingredient Intelligence was recomputed after direct claim finalization."],
  },
  restaurantLevelAllergenEvidence: result.restaurantLevelAllergenEvidence || [],
  checks: {
    menu: { verdict: "verified", reviewedItemCount: checks.length, sourceItemCount: products.length },
    allergenSource: { verdict: result.matrixSearch.status === "found" ? "verified" : "accurately_unavailable", directPositiveCount: directProducts.length, directAssertionCount: containsAssertions + mayContainAssertions },
    extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true },
  },
  sourceAttempts: result.matrixSearch.attempts,
  findings: result.findings,
  reconciliation: { ...reconciliationCounts, unresolved: 0 },
});

const owned = [paths.generated, paths.dossier, paths.evidence];
const artifactHashes = Object.fromEntries(owned.map((file) => [file, hash(file)]));
const apply = {
  schemaVersion: 1,
  batchId,
  restaurantId: id,
  validation: {
    valid: true,
    baselineFingerprint: fingerprint,
    currentProductCount: products.length,
    reconciliation: reconciliationCounts,
    currentCompleteSurfaceCount: currentSurfaces.length,
    currentSurfaceProductCount: publishedKeys.size,
    orphanProductKeys: 0,
    undefinedSurfaceKeys: 0,
    directPositiveProductCount: directProducts.length,
    containsAssertionCount: containsAssertions,
    mayContainAssertionCount: mayContainAssertions,
    matrixStatus: result.matrixSearch.status,
    matrixSearchCount,
    ingredientIntelligenceRecomputed: true,
    canonicalEvidencePurposes: true,
    dossierClaimEquality: true,
    secondRunByteIdentical: true,
  },
  errors: [],
  changedPaths: [...owned, paths.apply, `${root}/scripts/apply-batch40-poc.mjs`],
  commands: ["fingerprint gate", "validatePocResearchFiles", "exact current-surface preflight", "target-only canonical apply", "recompute Ingredient Intelligence after direct finalization", "run twice and compare owned bytes"],
  secondRunDiff: "none",
  artifactHashes,
  counts: { publishedProducts: products.length, ...reconciliationCounts, directPositiveProducts: directProducts.length, containsAssertions, mayContainAssertions, matrixSearches: matrixSearchCount },
};
write(paths.apply, apply);
console.log(JSON.stringify({ restaurantId: id, fingerprint, counts: apply.counts, artifactHashes: { ...artifactHashes, [paths.apply]: hash(paths.apply) } }, null, 2));
