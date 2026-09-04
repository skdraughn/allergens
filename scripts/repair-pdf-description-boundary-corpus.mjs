#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const apply = process.argv.includes("--apply");
const repositoryPath = "src/data/generated/restaurants.generated.json";
const targetsPath = "scripts/pdf-description-boundary-repair-targets.json";
const repository = JSON.parse(fs.readFileSync(repositoryPath, "utf8"));
const auditedRestaurantIds = new Set([
  "1799-prime-steak-and-seafood-alexandria-va-dc-metro", "agora-dc", "agora-tysons-va",
  "cafe-milano-washington-dc-dc-metro", "centrolina-dc", "chadwicks-alexandria-va-dc-metro",
  "chasin-tails-seafood-that-celebrates-falls-church-va-dc-metro", "circa-at-foggy-bottom-washington-dc-dc-metro",
  "glory-days-grill-lorton-va-dc-metro", "ilili-dc", "inca-social-vienna-va-dc-metro",
  "ivy-city-smokehouse-washington-dc-dc-metro", "kizuna-sushi-ramen-tysons-va", "la-vie-washington-dc-dc-metro",
  "laos-in-town-dc", "lost-dog-cafe-dunn-loring-fairfax-va-dc-metro", "martins-tavern-dc",
  "mi-vida-wharf-dc", "milk-and-honey-southern-inspired-kitchen-college-park-md-dc-metro", "moby-dick-dc",
  "north-italia-reston-va", "north-italia-tysons", "oak-room-bernadettes-dc", "ocean-prime-dc",
  "open-road-falls-church-va-dc-metro", "osm-1799-prime-204629784", "osm-anatolian-bistro-6230019077",
  "osm-circa-2788369922", "osm-glory-days-grille-237472337", "osm-hi-fi-tex-mex-bbq-12965590481",
  "osm-sushi-jin-10687259039", "osm-ted-s-montana-2414839960", "osm-urbano-9821308296",
  "replacement-cafe-fiorello-dc-washington-dc", "replacement-calico-washington-dc",
  "replacement-circa-at-clarendon-arlington-va", "replacement-circa-at-navy-yard-washington-dc",
  "replacement-circa-at-the-boro-tysons-va", "replacement-donsak-thai-restaurant-washington-dc",
  "replacement-easy-company-washington-dc", "replacement-eleni-s-greek-taverna-springfield-va",
  "replacement-gatsby-washington-dc", "replacement-la-fiamma-italian-kitchen-alexandria-va",
  "replacement-moxies-washington-dc-restaurant-washington-dc", "replacement-the-little-grand-washington-dc",
  "salt-and-vine-washington-dc-dc-metro", "succotash-dc", "sweet-leaf-arlington",
  "the-dabney-dc", "the-grill-washington-dc-dc-metro", "the-hamilton-dc",
  "the-sovereign-washington-dc-dc-metro", "uncle-julio-s-gaithersburg-gaithersburg-md-dc-metro",
  "van-leeuwen-dc", "velocity-bar-kitchen-fairfax-va", "wingos-georgetown-dc",
  // Additional mixed-case boundary failures found during the expanded pass.
  "maketto-dc", "rasika-penn-quarter-dc", "nandos-dc", "silver-diner-dc",
  "replacement-bistro-cacao-washington-dc", "replacement-mgm-roast-beef-washington-dc",
  "blue-ridge-seafood-restaurant-gainesville-va", "floreria-atlantico-dc",
  "barcelona-wine-bar-reston-va", "guerra-steakhouse-arlington-va",
]);

// These are genuine aggregate products whose descriptions intentionally name
// other products or selectable components.
const preserve = new Set([
  "mi-vida-wharf-dc:un-poco-de-todo",
  "inca-social-vienna-va-dc-metro:current:jalea-mixta",
  "ivy-city-smokehouse-washington-dc-dc-metro:the-crabcakes",
  "replacement-eleni-s-greek-taverna-springfield-va:mezze",
  "replacement-the-little-grand-washington-dc:sweets",
  "succotash-dc:dollar2900adult",
  "succotash-dc:dollar29adult",
  "succotash-dc:dollar41adult",
  "succotash-dc:chicken-and-waffles-shrimpngrits",
  "sardi-s-pollo-a-la-brasa-beltsville-washington-dc-dc-metro:5-large",
  "sardi-s-pollo-a-la-brasa-beltsville-washington-dc-dc-metro:ultimate-3-meat-combo",
  "sardi-s-pollo-a-la-brasa-beltsville-washington-dc-dc-metro:world-famous-souvlaki",
  "sardi-s-pollo-a-la-brasa-langley-park-takoma-park-md-dc-metro:5-large",
  "sardi-s-pollo-a-la-brasa-langley-park-takoma-park-md-dc-metro:ultimate-3-meat-combo",
  "sardi-s-pollo-a-la-brasa-langley-park-takoma-park-md-dc-metro:world-famous-souvlaki",
  ...[
    "burrata",
    "costoletta-di-vitello",
    "la-gricia",
    "la-scala",
    "merluzzo-nero-carbonaro",
    "parmigiana-di-zucchine",
    "san-babila",
    "via-condotti",
    "via-verdi",
  ].map((id) => `cafe-milano-washington-dc-dc-metro:${id}`),
]);

const forceClear = new Set([
  "moby-dick-dc:homemade-desserts",
  "the-dabney-dc:sea-island-white-peas",
  "replacement-easy-company-washington-dc:bacon",
  "replacement-moxies-washington-dc-restaurant-washington-dc:french-onion-soup",
  "ocean-prime-dc:shrimpsaut-e-tabasco-cream-sauce",
  "the-grill-washington-dc-dc-metro:cajun-branzino",
  "open-road-falls-church-va-dc-metro:home-fries",
  "salt-and-vine-washington-dc-dc-metro:artichoke-and-crab-fritatta",
  "lost-dog-cafe-dunn-loring-fairfax-va-dc-metro:top-with-garlic-chicken",
  "oak-room-bernadettes-dc:herbed-french-fries",
  "inca-social-vienna-va-dc-metro:current:chicken-causa",
  "replacement-gatsby-washington-dc:deviled-eggs-buttermilk-biscuits",
  "replacement-cafe-fiorello-dc-washington-dc:burrata-mozzarella",
  "cafe-milano-washington-dc-dc-metro:hazelnut-chocolate-cream-sauce",
  "cafe-milano-washington-dc-dc-metro:lemon-risotto-shrimp-asparagus",
  "succotash-dc:mushroom-dirty-rice",
  "north-italia-tysons:chicken-pesto",
  "north-italia-reston-va:chicken-pesto",
  "north-italia-reston-va:crispy-hash-potatoes",
  "north-italia-reston-va:strawberries-and-cream-french-toast",
  "uncle-julio-s-gaithersburg-gaithersburg-md-dc-metro:shrimp-al-pastor-2105",
  "uncle-julio-s-gaithersburg-gaithersburg-md-dc-metro:spicy-red-chile-sauce-15-fl-oz",
  "ivy-city-smokehouse-washington-dc-dc-metro:hardwood-smoked-bacon",
  "glory-days-grill-lorton-va-dc-metro:burgers-and-handhelds",
  "glory-days-grill-lorton-va-dc-metro:winning",
  "glory-days-grill-lorton-va-dc-metro:winning-the-day",
  "glory-days-grill-lorton-va-dc-metro:side-house-salad-186-cal",
  "osm-glory-days-grille-237472337:burgers-and-handhelds",
  "osm-glory-days-grille-237472337:winning",
  "osm-glory-days-grille-237472337:winning-the-day",
]);

const customBoundary = new Map([
  ...[
    "circa-at-foggy-bottom-washington-dc-dc-metro",
    "osm-circa-2788369922",
    "replacement-circa-at-clarendon-arlington-va",
    "replacement-circa-at-navy-yard-washington-dc",
    "replacement-circa-at-the-boro-tysons-va",
  ].map((id) => [`${id}:hummus`, "WAGYUMEATBALLSLIDERS"]),
  ["circa-at-foggy-bottom-washington-dc-dc-metro:circa-foggy-bottom-hummus", "WAGYUMEATBALLSLIDERS"],
  ["la-vie-washington-dc-dc-metro:riviera-chicken-and-waffles", "GOLDEN TIRAMISU"],
  ["succotash-dc:maryland-crab-cake", "JAMIE’S CORNBREAD"],
  ["cafe-milano-washington-dc-dc-metro:mozzarella", "VITELLO TONNATO"],
  ["cafe-milano-washington-dc-dc-metro:ravioli-del-plin-cavalli", "TORTELLI SEMSEM"],
  ["replacement-la-fiamma-italian-kitchen-alexandria-va:frittata-spagnola-dollar12-vegetarian", "WESTERN OMELETTE"],
  ["replacement-la-fiamma-italian-kitchen-alexandria-va:meatball-sub", "PARMIGIANA SUB"],
  ["replacement-la-fiamma-italian-kitchen-alexandria-va:mozzarella-caprese", "BRUSCHETTA"],
  ["replacement-la-fiamma-italian-kitchen-alexandria-va:ravioli-di-carne", "SALSICCIA E PEPE"],
  ["replacement-gatsby-washington-dc:chicken-matzo-ball-soupor", "PEROGIES (4)"],
  ["wingos-georgetown-dc:molten-lava-cake", "ICECREAM PINTS"],
  ["martins-tavern-dc:ty-cobb-salad", "APPETIZERS"],
  ["kizuna-sushi-ramen-tysons-va:pork-shoyu", "KIZUNA RAMEN"],
  ["replacement-calico-washington-dc:vegetable-potstickers", "FLATBREAD"],
  ["the-sovereign-washington-dc-dc-metro:oven-roasted-salmon", "RABBIT IN KRIEK"],
  ["la-vie-washington-dc-dc-metro:smash-burger", "FOR THE TABLE"],
]);

// Mixed-case headings missed by the original uppercase-only audit.
const additionalBoundary = new Map([
  ["maketto-dc:crystal-shrimp-dumplings", "Veggie Spring Rolls"],
  ["maketto-dc:duck-noodle-soup", "Wok-Fried Yu Choy"],
  ["maketto-dc:maketto-fried-chicken", "Smoked Dry Aged Brisket"],
  ["maketto-dc:egg-custard-tart", "Banana Matcha Tiramisu"],
  ["rasika-penn-quarter-dc:kesar-pista-kulfi-gdnegg", "Mango Rasmalai"],
  ["nandos-dc:spicy-chicken-caesar-wrap-820-cal", "Sweet & Spicy Chicken Wrap"],
  ["silver-diner-dc:creekstone-farms-smash-burger", "Koch’s Farm Turkey & Avocado Smash Burger"],
  ["replacement-bistro-cacao-washington-dc:crevettes-epicees", "Steak Tartare"],
  ["replacement-mgm-roast-beef-washington-dc:steak-and-cheese", "The Smashburger"],
  ["blue-ridge-seafood-restaurant-gainesville-va:stuffed-flounder", "Homemade Crab Cakes"],
  ["floreria-atlantico-dc:fish-and-chips", "Calamaretti"],
  ["barcelona-wine-bar-reston-va:prod-gambas-al-ajillo", "salmon a la plancha"],
  ["guerra-steakhouse-arlington-va:crab-cake", "eggplant and portobello"],
]);

const changedRestaurants = new Set();
const changes = [];

for (const restaurant of repository.restaurants) {
  const headings = (restaurant.items ?? [])
    .map((item) => String(item.name ?? "").trim())
    .filter((name) => name.length >= 7);

  for (const item of restaurant.items ?? []) {
    const key = `${restaurant.id}:${item.id}`;
    if (preserve.has(key) || !item.description) continue;
    const pdfDerived =
      /pdf/i.test(String(item.sourceType ?? "")) ||
      /pdf/i.test(String(restaurant.parserProfile ?? "")) ||
      (item.sourceUrls ?? []).some((url) => /\.pdf(?:$|\?)/i.test(url));
    if (!pdfDerived && !additionalBoundary.has(key) && !customBoundary.has(key) && !forceClear.has(key)) continue;

    // A large family of stored PDF descriptions was clipped at the projection's
    // old 240-character ceiling after text from one or more following rows had
    // already bled into the value. If a near-ceiling value names another item,
    // it is safer to remove the ambiguous prose than publish it as ingredients
    // for the wrong product. Explicitly audited boundaries below retain the
    // trustworthy prefix where the split point is known.
    const cappedEmbeddedHeading = item.description.length >= 235 && item.description.length <= 240
      ? headings.find((heading) =>
          heading !== item.name &&
          heading.length >= 9 &&
          indexOfCaseInsensitive(item.description.slice(18), heading) >= 0)
      : null;
    if (!auditedRestaurantIds.has(restaurant.id) && !cappedEmbeddedHeading) continue;

    let nextDescription = item.description;
    let reason = null;
    if (forceClear.has(key) || (cappedEmbeddedHeading && !customBoundary.has(key) && !additionalBoundary.has(key))) {
      nextDescription = null;
      reason = forceClear.has(key) ? "misassigned-description" : "ambiguous-capped-pdf-row";
    } else {
      const explicitBoundary = customBoundary.get(key) ?? additionalBoundary.get(key);
      const candidates = explicitBoundary
        ? [explicitBoundary]
        : headings.filter((heading) => heading !== item.name && item.description.includes(heading.toUpperCase()));

      if (candidates.length > 0 || /\s[•·]{3,}\s*/.test(item.description)) {
        const indexes = candidates
          .map((heading) => indexOfCaseInsensitive(item.description, heading))
          .filter((index) => index >= 0);
        const separatorIndex = item.description.search(/\s[•·]{3,}\s*/);
        if (separatorIndex >= 0) indexes.push(separatorIndex);
        const boundary = Math.min(...indexes);
        if (Number.isFinite(boundary)) {
          const prefix = item.description.slice(0, boundary).trim().replace(/[,:;\-•]+$/, "").trim();
          nextDescription = prefix.length >= 12 ? prefix : null;
          reason = nextDescription ? "truncated-at-next-product" : "misassigned-description";
        }
      }
    }

    if (nextDescription === item.description) continue;
    const before = item.description;
    item.description = nextDescription;
    if (item.ingredientsText === before) item.ingredientsText = nextDescription;
    if (item.sourceSummary === before) item.sourceSummary = nextDescription;
    changedRestaurants.add(restaurant.id);
    changes.push({ restaurantId: restaurant.id, itemId: item.id, reason, before, after: nextDescription });
  }
}

for (let index = 0; index < repository.restaurants.length; index += 1) {
  const restaurant = repository.restaurants[index];
  if (!changedRestaurants.has(restaurant.id)) continue;
  repository.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(restaurant);
  syncCanonicalDescriptions(repository.restaurants[index]);
}

if (apply) {
  fs.writeFileSync(repositoryPath, `${JSON.stringify(repository, null, 2)}\n`);
  const priorTargets = fs.existsSync(targetsPath) ? JSON.parse(fs.readFileSync(targetsPath, "utf8")) : [];
  fs.writeFileSync(targetsPath, `${JSON.stringify([...new Set([...priorTargets, ...changedRestaurants])].sort(), null, 2)}\n`);
}
if (process.argv.includes("--report")) {
  fs.writeFileSync("/tmp/pdf-description-boundary-repair-report.json", `${JSON.stringify(changes, null, 2)}\n`);
}

console.log(JSON.stringify({
  apply,
  changedRestaurantCount: changedRestaurants.size,
  changedDescriptionCount: changes.length,
  clearedDescriptionCount: changes.filter((change) => change.after == null).length,
  truncatedDescriptionCount: changes.filter((change) => change.after != null).length,
  fingerprint: sha256(changes.map(({ restaurantId, itemId, after }) => ({ restaurantId, itemId, after }))),
  changedRestaurantIds: [...changedRestaurants].sort(),
}, null, 2));

function syncCanonicalDescriptions(restaurant) {
  const dossierPath = `data/restaurant-verification/restaurants/${restaurant.id}.json`;
  if (!fs.existsSync(dossierPath)) return;
  const dossier = JSON.parse(fs.readFileSync(dossierPath, "utf8"));
  const byId = new Map((restaurant.items ?? []).map((item) => [item.id, item]));
  let changed = false;
  for (const product of dossier.currentCatalog?.products ?? []) {
    const item = byId.get(product.currentProductKey);
    if (!item || !("description" in product)) continue;
    if ((product.description ?? null) === (item.description ?? null)) continue;
    if (item.description) product.description = item.description;
    else delete product.description;
    changed = true;
  }
  if (!changed || !apply) return;
  dossier.currentCatalog.notes = [...new Set([...(dossier.currentCatalog.notes ?? []), "Stored description boundary bleed was removed without changing direct allergen authority."])];
  dossier.updatedAt = "2026-08-31T00:00:00.000Z";
  fs.writeFileSync(dossierPath, `${JSON.stringify(dossier, null, 2)}\n`);
}

function indexOfCaseInsensitive(value, query) {
  return value.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
}

function sha256(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
