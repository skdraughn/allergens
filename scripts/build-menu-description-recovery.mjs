#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

import {
  assessRecoveredDescription as descriptionDecision,
  normalizeRecoveredText as normalize,
} from "./description-recovery-quality.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryPath = path.join(root, "src/data/generated/restaurants.generated.json");
const recoveryDirectory = path.join(root, "data/restaurant-verification/description-recovery");
const manifestPath = path.join(recoveryDirectory, "manifest.json");
const freshDirectory = path.resolve(
  root,
  argument("fresh-directory") ??
    "data/restaurant-verification/reports/source-parity-audit/fresh",
);
if (
  process.argv.some((value) => value.startsWith("--fresh-directory="))
  && fs.existsSync(path.join(freshDirectory, "fresh"))
) {
  throw new Error(
    `Fresh audit directory points at a round root instead of its fresh/ directory: ${path.relative(root, freshDirectory)}`,
  );
}
const reportPath = path.join(
  root,
  "data/restaurant-verification/reports/menu-description-recovery-assessment.json",
);
const apply = process.argv.includes("--apply");

const repositoryBytes = fs.readFileSync(repositoryPath);
const repository = JSON.parse(repositoryBytes.toString("utf8"));
const previousManifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : null;
const previousPlan = readPreviousPlan(previousManifest);
const previousByTarget = new Map(
  (previousPlan?.records ?? []).map((record) => [targetKey(record.restaurantId, record.itemId), record]),
);

const records = [];
const freshRecoveryTargets = new Set();
const rejectionReasons = {};
const rejectionSourceTypes = {};
const rejectionExamples = [];
const ambiguityExamples = [];
const decisions = {
  retainedPrevious: 0,
  restoredPrevious: 0,
  addedExactId: 0,
  addedExactName: 0,
  rejectedUntrusted: 0,
  rejectedAmbiguous: 0,
  rejectedQuality: 0,
  invalidFreshAudit: 0,
  skippedExisting: 0,
};
const affectedRestaurants = new Set();
const acceptedFresh = [];
const knownExtractionArtifacts = new Map([
  // Round 58: Tiki Thai's legacy HTML cards are shifted across neighboring
  // rows; none of these exact pairs is item-bounded.
  [targetKey("tiki-thai-reston-reston-va-dc-metro", "chicken-coconut-milk-broccoli"), normalize("Southern Thai curry, chicken, pineapple, Thai basil, Thai eggplants, coconut milk, bell peppers, bamboo")],
  [targetKey("tiki-thai-reston-reston-va-dc-metro", "chicken-potatoes-onions-curry-sauce"), normalize("Marinated salmon, vinegared rice, tobiko, roasted seaweed, sesame seeds, spring roll pastry")],
  [targetKey("tiki-thai-reston-reston-va-dc-metro", "chickenandveggie-wontons-bok-choy"), normalize("Chicken, thin rice noodles, egg, bean curd, sweet radish, bean sprouts, scallions, peanuts")],
  [targetKey("tiki-thai-reston-reston-va-dc-metro", "choice-of-meat-coconut-milk-broccoli"), normalize("-Grandmom’s recipe- Choice of meat, Southern Thai curry, Thai basil, pineapple, Thai eggplants, coconut milk, bell peppers, bamboo")],
  [targetKey("tiki-thai-reston-reston-va-dc-metro", "scallions-onions-cherry-tomatoes-egg"), normalize("Flat rice noodles, Thai basil, cherry tomatoes, onions, carrots, bell peppers, finger peppers")],
  [targetKey("tiki-thai-reston-reston-va-dc-metro", "shrimp"), normalize("Chicken, lemongrass, chili, cherry tomatoes, kaffir lime, mushrooms")],
  [targetKey("tiki-thai-reston-reston-va-dc-metro", "shrimp-dollar1"), normalize("Chicken, lemongrass, chili, cherry tomatoes, kaffir lime, mushrooms Shrimp +$1")],
  [targetKey("tiki-thai-reston-reston-va-dc-metro", "shrimpandchicken-wontons-bok-choy"), normalize("Green papaya, carrots, green beans, cherry tomatoes, peanuts, chili lime dressing Add Grilled Shrimp +$4")],
  [targetKey("tiki-thai-reston-reston-va-dc-metro", "spring-rolls-jacketed-shrimp-gyozas"), normalize("Blended Scotch, Quebranta Pisco, Orgeat, Ginger, Trinidad Bitters, Peated Scotch, Lemon")],
  // Round 57: nutrition-only text, neighboring drink/add-on cards, clipped
  // fragments, and a multi-row pasta block are not item descriptions.
  [targetKey("le-botaniste-dc", "botanical-salad"), normalize("cal 8g protein 13g fiber 0.34 kg CO₂")],
  [targetKey("jula-s-on-the-potomac-alexandria-va-dc-metro", "green-chartreuse"), normalize("2 oz. pour Amaro Averna 2 oz. pour")],
  [targetKey("osm-hunter-s-3880545349", "crispy-thai-brussels"), normalize("-spice | sweet soy")],
  [targetKey("osm-hunter-s-3880545349", "quesadilla-dollar16-onions"), normalize("Baby shrimp +12, chicken +8, filet tips +18, grilled steak +15, pulled pork +9, Portobello mushroom +5")],
  [targetKey("osm-hunter-s-3880545349", "roasted-turkey"), normalize("-grain bread")],
  [targetKey("osm-il-pizzico-6595475668", "la-pasta-dinner"), normalize("Ravioli di funghi al pistacchio Ravioli filled with mushrooms and ricotta served with pistachio-cream sauce Paccheri Homemade large rigatoni, garlic, shrimp, anchovies, toasted bread crumbs tomato Casarecce alla Krizia Homemade casarecce , prosciutto, peas, tomatoes, touch of cream sauce")],
  // Round 56: a dessert promotion followed the fries card; it is not the
  // Sweet Potato Fries description.
  [targetKey("osm-finnegan-s-wake-irish-pub-1332524327", "sweet-potato-fries"), normalize("Ask your server about dessert and our seasonal menu!")],
  // Round 55: this HTML card paired the next add-on's title with the butter row.
  [targetKey("j-gilbert-s-wood-fired-steaks-and-seafood-mclean-va-dc-metro", "ancho-chile-butter"), normalize("Bourbon Maple Shrimp")],
  // Round 54: site navigation/contact cards and section headings were retained
  // as legacy catalog rows; their neighboring labels are not food descriptions.
  [targetKey("replacement-chez-billy-sud-washington-dc", "dress-code"), normalize("Casual attire.")],
  [targetKey("replacement-chez-billy-sud-washington-dc", "socialize"), normalize("Twitter, Instagram, Facebook")],
  [targetKey("replacement-chez-billy-sud-washington-dc", "general-email-please-allow-24-48-hrs-for-reply"), normalize("info@chezbillysud.com")],
  [targetKey("replacement-al-tiramisu-washington-dc", "dolci"), normalize("Authentic Italian")],
  [targetKey("replacement-al-tiramisu-washington-dc", "secondi"), normalize("Second Course")],
  // Round 53: Villa Yara's PDF columns attached neighboring dishes and a
  // price to three exact-name rows. Only reviewed item-bounded copy is kept.
  [targetKey("replacement-villa-yara-washington-dc", "hummus"), normalize("Chickpeas, tahini, lemon (v, gf) Mouhammara Spicy Roasted Red Pepper, Walnuts, Pomegranate Molasses, Pita Crumbs (vg, n )")],
  [targetKey("replacement-villa-yara-washington-dc", "lamb-chops"), normalize("$30 grilled medium")],
  [targetKey("replacement-villa-yara-washington-dc", "arugula"), normalize("(vg, gf) $16 Baked Halloumi Baked Halloumi Cheese . Shakshuka . Olives . Zaatar (vg, gf) Kibbeh Nayeh")],
  // Round 51: quantity fragments and restaurant/section labels are not
  // product descriptions, even when a marketplace card pairs them to a row.
  [targetKey("copycat-co-dc", "skewer-porkcheek"), normalize("2 skewers per")],
  [targetKey("la-casina-capitol-hill-dc", "pizza-la-classica"), normalize("Traditional Recipes")],
  [targetKey("la-casina-capitol-hill-dc", "desserts-pinsa-dolce"), normalize("La Casina")],
  [targetKey("la-casina-capitol-hill-dc", "desserts-tiramisu-specialties"), normalize("Traditional Italian")],
  [targetKey("la-casita-gaithersburg-dc-metro", "frescos-naturales-ca-refreshments"), normalize("Our beverages")],
  [targetKey("la-casita-gaithersburg-dc-metro", "los-tipicos"), normalize("C.A. Specialities")],
  [targetKey("replacement-elilta-restaurant-silver-spring-md", "hot-coffee-oe-tea"), normalize("Espresso")],
  [targetKey("eddie-vs-tysons-va", "private-crab-corn-chowder"), normalize("Lump Crab, Smoked Bacon and Sweet Corn Classic Caesar Salad Shaved Parmesan, Garlic Croutons and Tapenade Organic Greens Salad Baby Heirloom Tomatoes, Julienne Carrots, Apple-Cider Vinaigrette Main Course Choice 8 oz Filet Mignon Center...")],
  [targetKey("ivy-city-smokehouse-washington-dc-dc-metro", "hardwood-smoked-bacon"), normalize("HASH BROWNS CRAB CAKE")],
  // Round 50: these candidates crossed PDF/page boundaries or are generic
  // navigation/marketing copy rather than item-bounded menu descriptions.
  [targetKey("the-dabney-dc", "anson-mills-yellow-cornbread"), normalize("CHEF’S FIVE COURSE MENU At The Dabney, our goal is to showcase the quality and diversity of the ingredients within our region and the wonderful people who raise, grow, and produce them. We choose to cook over embers in our wood-burning h...")],
  [targetKey("the-dabney-dc", "sea-island-white-peas"), normalize("ANSON MILLS YELLOW CORNBREAD At The Dabney, our goal is to showcase the quality and diversity of the ingredients within our region and the wonderful people who raise, grow, and produce them. We choose to cook over embers in our wood-burn...")],
  [targetKey("uchi-dc", "nine-course-menu-for"), normalize("cool tastings uchi salad baby greens, daikon, cashew pesto, crispy wild rice seaweed salad cucumber, green apple, sesame hama chili ‡ yellowtail, ponzu, thai chili, orange supreme hot tastings brussels sprouts sweet chili, lemon 5.5 kara...")],
  [targetKey("the-capital-burger-washington-dc-dc-metro", "parmesan-truffle-fries"), normalize("Visit The Capital Burger for luxury burgers and snacks like Hand-Cut Fries or Kung Pao Brussels Sprouts. View the full menu for burgers, sandwiches and more.")],
  [targetKey("osm-bakeshop-11399205397", "chocolate-chunk-cookies"), normalize("XTREME SPRINKLES -- Vanilla Confetti Cake, Vanilla Buttercream, Totally Covered in Rainbow Sprinkles (No Writing On This Cake) XTREME SPRINKLES WITH WRITING -- Vanilla Confetti Cake, Vanilla Buttercream, Sides Covered in Rainbow Sprinkle...")],
  // Round 49: Honor's multi-column PDFs attached neighboring rows or section
  // headings to these exact items. Pearl Street's event site is not a menu.
  [targetKey("replacement-honor-brewing-kitchen-fairfax-fairfax-va", "6-piece-grilled-wings"), normalize("CHICAGO STYLE HOT DOG MINI NACHO CHEESEBURGER SLIDERS")],
  [targetKey("replacement-honor-brewing-kitchen-fairfax-fairfax-va", "bbq-chicken"), normalize("Grilled chicken, shredded cheddar, roasted garlic, shaved red onion, house BBQ sauce Fig, prosciutto, arugula, with balsamic GETTING FIGGY WIT IT")],
  [targetKey("replacement-honor-brewing-kitchen-fairfax-fairfax-va", "bbq-glazed-salmon"), normalize("Crispy chicken breast w/ a creamy mustard sauce. Served w/ arugula cherry tomatoes, red onion, cucumber, & apple cider vinaigrette")],
  [targetKey("replacement-honor-brewing-kitchen-fairfax-fairfax-va", "breakfast-potatoes"), normalize("EGGS* (ANY STYLE) FRESH FRUIT NUTELLA JOHNNY CAKES (2) BRUNCH COCKTAILS")],
  [targetKey("replacement-honor-brewing-kitchen-fairfax-fairfax-va", "cheese"), normalize("HANDHELDSserved with beer battered sidewinders cheddar, american cheese, lettuce, tomato, onion, and house rock sauce on a sesame seed bun")],
  [targetKey("replacement-honor-brewing-kitchen-fairfax-fairfax-va", "grilled-chicken-295"), normalize("HOUSE NACHOS Tempura shrimp covered in sweet chili sriracha & sweet soy ginger, topped w/ green onions, chili threads, & cilantro")],
  [targetKey("replacement-honor-brewing-kitchen-fairfax-fairfax-va", "half-rack-bbq-ribs"), normalize("St. Louis style, slow cooked and piled high served with house-made coleslaw and mac and cheese 8oz house BBQ glazed salmon, grilled asparagus, mashed potatoes")],
  // Round 48: these exact-name candidates crossed menu-card boundaries or
  // came from Alta Strada's Foxwoods menu rather than its Fairfax location.
  [targetKey("replacement-awakening-bar-and-grill-washington-dc", "mambo-wings-4"), normalize("Select Draft Beers House Mixed Drinks All Bar Bites and Specialty Cocktails")],
  [targetKey("replacement-awakening-bar-and-grill-washington-dc", "garlic-green-beans"), normalize("House Fries Hand-cut fries, with parmesan cheese, olive oil, and cracked pepper")],
  [targetKey("replacement-awakening-bar-and-grill-washington-dc", "mac-n-cheese"), normalize("Braised Kale")],
  [targetKey("replacement-alta-strada-fairfax-va-fairfax-va", "chefs-salumi-and-cheese-plate-for-two"), normalize("Creamy Burrata")],
  [targetKey("replacement-alta-strada-fairfax-va-fairfax-va", "chicken-under-a-brick"), normalize("Chef’s Whim")],
  [targetKey("dyfres-burger-springfield-dc-metro", "dyfres-double-trouble"), normalize("(0) Grilled charcoal bun, twice Beef Patty* double the fun, Mozzarella cheese, Bacon, tomato and sautéed onions, signature homemade sauce")],
  // Round 46: nutrition columns and a neighboring sardine row escaped from
  // their source boundaries and are not descriptions for these products.
  [targetKey("chain-rita-s-italian-ice", "hand-scooped-custard-cookie-sandwiches"), normalize("Product Flavor Calories Calories from Fat Fat Saturated Fat Trans Fat Cholesterol Sodium Total Carbohydrates Dietary Fiber Total Sugar Added Sugar Protein Custard Cookie Sandwhiches")],
  [targetKey("cordelia-fishbar-dc", "chicken-chermoula"), normalize("harissa-spiced yogurt gf Pinhais Sardines in Oil · peperonata, arugula, whipped butter, focaccia")],
  [targetKey("dolan-uyghur-dc", "royal-laghman"), normalize("$ Beef, stir-fried onions, cabbage, mushrooms, green and red peppers, oyster-flavored sauce, and tomato topped hand-pulled chewy noodles.")],
  [targetKey("cordelia-fishbar-dc", "whole-grilled-branzino"), normalize("stewed sungold tomatoes, gigante beans, kale, citrus pesto, pine nuts | rw +10 gf")],
  // Round 45: CIRCA's card parser crossed the side-item boundary and attached
  // the next menu control/section copy to Garlic Mashed Potatoes.
  [targetKey("osm-circa-2788369922", "garlic-mashed-potatoes"), normalize("Seasonal Veg VIEW MENU ORDER ONLINE SMALL PLATES")],
  // Round 44: this delivery-marketplace sentence is generic promotional copy,
  // not a restaurant-authored ingredient or preparation description.
  [targetKey("unconventional-diner-washington-dc-dc-metro", "side-of-chicken"), normalize("Tender chicken pieces, seasoned and grilled to a golden brown, garnished with fresh herbs.")],
  [targetKey("osteria-morini-washington-dc-dc-metro", "frittata"), normalize("20 market vegetables, pesto, almond, burrata, arugula, lemon vinaigrette")],
  ...[["side-bacon", "5 strips"], ["side-sausage", "2 Patties"], ["side-vegan-sausage", "2 Patties"]].map(([itemId, value]) => [targetKey("buffalo-bergen-capitol-hill-dc", itemId), normalize(value)]),
  [targetKey("osteria-morini-washington-dc-dc-metro", "bacon"), normalize("8 applewood smoked")],
  [targetKey("morton-s-the-steakhouse-reston-va-dc-metro", "french-onion-soup-gratinee"), normalize("(340 cal.)")],
  [targetKey("morton-s-the-steakhouse-reston-va-dc-metro", "grilled-salmon-fillet"), normalize("(730 cal.)")],
  [targetKey("morton-s-the-steakhouse-reston-va-dc-metro", "lobster-bisque"), normalize("6 oz. Center-Cut Filet Mignon")],
  [targetKey("morton-s-the-steakhouse-reston-va-dc-metro", "remy-martin-sauce-au-poivre"), normalize("'Oscar-Style' Crab")],
  [targetKey("agora-tysons-va", "cherry-jamgoat-cheese"), normalize("For the table")],
  [targetKey("replacement-mandalay-restaurant-and-cafe-silver-spring-md", "egg-noodle"), normalize("05. Mandalay Acho Yay")],
  [targetKey("replacement-mandalay-restaurant-and-cafe-silver-spring-md", "rice-noodle"), normalize("04. Hingar")],
  [targetKey("replacement-the-lafayette-washington-dc", "freshly-brewed-coffee-or-decaffeinated-coffee"), normalize("Breakfast, Earl Grey, Gun Powder, Jasmin, Thé Vert à la Menthe Touareg, Chamomile, The Caramel, The Darjeeling, Nuit D’été, Nuit Á Versailles, Jaune Lemon, Miss Dammann, Tisane Des Merveilles, 4 Fruit Rouges")],
  [targetKey("replacement-the-lafayette-washington-dc", "smoked-salmon"), normalize("Assorted Berries")],
  [targetKey("replacement-zeffirelli-ristorante-italiano-herndon-va", "white-chocolate-mouse-cake"), normalize("profitterole ONLINE LUNCH MENU")],
  [targetKey("chido-s-tex-mex-grill-laurel-md-dc-metro", "enchiladas"), normalize("Tacos Bandeja Paisa")],
  [targetKey("agua-301-restaurant-washington-dc-dc-metro", "cilantro-rice"), normalize("Fried Sweet Plantains")],
  [targetKey("agua-301-restaurant-washington-dc-dc-metro", "black-bean-cheese-dip"), normalize("Black beans, Chihuahua cheese, onions, bell peppers, jalapeño, flour tortillas, hummus")],
  [targetKey("ireland-s-four-provinces-falls-church-va-dc-metro", "party-size"), normalize("Rehearsal Dinner Inquiry")],
  ...["calabresa-catupiry", "frango-catupiry", "milho-catupiry", "pepperoni", "quatro-queijos", "frango-barbecue", "margherita", "portuguesa"].map((itemId) => [
    targetKey("osm-brazilian-place-11397737801", itemId),
    normalize("Extra Toppings: Basil, Milho, Tomate, Cebola, or Olives +$3.00 Cheese, Chicken, Bacon, or Ham Calabresa +$4.00 Catupiry +$6.00"),
  ]),
  [targetKey("osm-juliano-s-subs-pizza-12493934493", "chicken-tenders"), normalize("4 large pcs")],
  [targetKey("art-and-soul-dc", "baked-items"), normalize("Assorted Pastries")],
  [targetKey("hello-betty-north-bethesda-md", "coffee-or-tea"), normalize("vanilla, hazelnut, caramel © 2023 Sage Restaurant Concepts. All rights reserved.")],
  [targetKey("replacement-new-heights-restaurant-washington-dc", "kids-salad-bowl"), normalize("Garden Salad Bowl")],
  [targetKey("replacement-district-rico-washington-dc", "whole-chicken-served-with-4-large-sides"), normalize("© District Rico")],
  [targetKey("mia-s-italian-kitchen-alexandria-va-dc-metro", "fresh-minestrone-soup"), normalize("Quart-sized")],
  [targetKey("mia-s-italian-kitchen-alexandria-va-dc-metro", "house-made-giardiniera"), normalize("Pint-sized")],
  [targetKey("mia-s-italian-kitchen-alexandria-va-dc-metro", "marinated-mixed-olives"), normalize("Pint-sized")],
  [targetKey("mia-s-italian-kitchen-alexandria-va-dc-metro", "kids-cheese-pizza"), normalize("For children 12 and under.")],
  [targetKey("mia-s-italian-kitchen-alexandria-va-dc-metro", "kids-pepperoni-pizza"), normalize("For children 12 and under.")],
  [targetKey("osm-perfect-pita-2245478989", "egg-and-cheese-only"), normalize("Served only until 10:30am.")],
  [targetKey("yellow-union-market-dc", "lamb-awarma-hummus"), normalize("- pom molasses + sumac onions")],
  [targetKey("yellow-union-market-dc", "tahini-chocolate-chip-brownie"), normalize("- chocolate chip brownie")],
  [targetKey("replacement-piero-s-corner-herndon-va", "lemon-scented-asparagus"), normalize("Contorni are side dishes made fresh, and with love in our kitchen, designed to satisfy a craving or paired with any of our main dishes. We hope you enjoy our creations! Our soups are made fresh daily!")],
  [targetKey("ruths-chris-tysons-corner-va", "ruths-the-bar"), normalize("Learn More")],
  [targetKey("wooboi-chicken-va", "garlic-rice"), normalize("10g Protein")],
  [targetKey("replacement-marx-cafe-revolutionary-cuisine-washington-dc", "chicken-piccata"), normalize("$ 23 Chicken breast, Linguine, Lemon, Parsley, White wine, capers")],
  [targetKey("replacement-marx-cafe-revolutionary-cuisine-washington-dc", "quesadilla-de-pollo"), normalize("Reg Chicken, Pepper Jack cheese, Pico de Gallo, Guacamole Categories: Happy Hour, Small Plates, Starters")],
  [targetKey("replacement-marx-cafe-revolutionary-cuisine-washington-dc", "shrimp-scampi"), normalize("Shrimp, Linguini, Garlic, White wine, Parsley, Red pepper flakes Categories: All Entrees, Dinner Items, Pastas")],
  [targetKey("replacement-marx-cafe-revolutionary-cuisine-washington-dc", "steak-crostini"), normalize("Reg. $ Grilled Hangar steak, Pest Aioli, Arugula Categories: Small Plates, Starters")],
  [targetKey("replacement-marx-cafe-revolutionary-cuisine-washington-dc", "wild-mushroom-crostini"), normalize("Reg Sauteed Mushrooms, Garlic, Herb, Cream Categories: Happy Hour, Small Plates, Starters")],
  [targetKey("osm-ema-rossi-pizzeria-13912184601", "gelato"), normalize("Seasonal flavors. Tuesday through Friday, 12 pm - 4 pm. Menu")],
  [targetKey("replacement-kingbird-washington-dc", "yogurt-matcha-coconut-milk-honey-banana-d"), normalize("yogurt · matcha · coconut milk · honey · banana (d, hc) Breakfast")],
  [targetKey("villa-yara-georgetown-dc", "lentil-soup"), normalize("chickpeas, tahini, lemon")],
  [targetKey("tuscarora-mill-restaurant-leesburg-va-dc-metro", "the-flank-steak-salad"), normalize("Crisp Romaine, Corn Relish, Grilled Onions, Chipotle Ranch BA")],
  [targetKey("luke-s-lobster-penn-quarter-washington-dc-dc-metro", "jonah-crab-roll"), normalize("served Luke's Way w/ chips and a soft drink $21 310 - 390 cal.")],
  [targetKey("luke-s-lobster-penn-quarter-washington-dc-dc-metro", "lobster-bisque-8oz12oz"), normalize("$11 210 - 340 cal.")],
  [targetKey("luke-s-lobster-penn-quarter-washington-dc-dc-metro", "new-england-clam-chowder-8oz12oz"), normalize("$8 260 - 390 cal.")],
  [targetKey("the-tombs-washington-dc-dc-metro", "busch-light-pitcher"), normalize("after 10pm")],
  [targetKey("the-tombs-washington-dc-dc-metro", "coors-light-pitchers"), normalize("after 10pm")],
  [
    targetKey("air-restaurant-washington-dc-dc-metro", "a-low-country-classic"),
    normalize("Greens, Cucumber , Tomato, Carrots , Croutons, Buttermilk Dressing"),
  ],
  [
    targetKey("osm-ay-e-meze-lounge-13134929927", "beef-short-rib"),
    normalize("chicken thigh / bell peppers and onions / basmati rice pilaf / garlic yogurt / long pepper (g.) beef tenderloin / bell peppers and onions / french fries / long pepper / tzatziki (g.) filet mignon kebab / 2 grilled"),
  ],
  [
    targetKey("belga-cafe-washington-dc-dc-metro", "n-a-pero-hour"),
    normalize("Spritz Del Conte Classico, club soda, blood orange, lots of ice Feeling Lunchy?"),
  ],
  [
    targetKey("belga-cafe-washington-dc-dc-metro", "mussels-mariniere-the-classique"),
    normalize("PEI mussels, white wine, shallots, celery, butter, garlic, parsley, Belgian frites, mayonnaise If You Need Some Extras & Like to Share"),
  ],
  [
    targetKey("billy-hicks-georgetown-dc", "wings"),
    normalize("Jumbo Chicken Wing"),
  ],
  [
    targetKey("osm-bistro-provence-4829739070", "bread-basket"),
    normalize("Fricassée d’Escargots de Bourgogne, Purée Fine d’Aubergines"),
  ],
  [
    targetKey(
      "bob-and-ediths-diner-springfield-va-dc-metro",
      "chef-salad",
    ),
    normalize("Crystal City"),
  ],
  [
    targetKey("maharani-palace-fine-indian-cuisine-and-bar-herndon-va-dc-metro", "maharaja-old-fashion"),
    normalize("Jalapeno tequila – muddle green chili triple sec – fresh lime juice agave and grand Marnier"),
  ],
  [
    targetKey("mamma-lucia-fallsgrove-dc-metro", "peas-and-mushrooms"),
    normalize("Side of Sausage, Peppers and Onions with Tomato Sauce"),
  ],
  [
    targetKey("stans-dc", "frenched-pork-chop"),
    normalize("Fried Chicken Breasts"),
  ],
  [
    targetKey("matchbox-penn-quarter-dc", "crispy-calamari"),
    normalize("matchbox chili cheddar, onions, jalapenos"),
  ],
  [
    targetKey(
      "matchbox-penn-quarter-dc",
      "sun-dried-tomatoes-cremini-mushrooms-garlic-bread",
    ),
    normalize("18-hour pork ribs, coleslaw, choice of cornbread or fries"),
  ],
  [
    targetKey("georgetown-bagelry-bethesda-dc-metro", "single-bagel"),
    normalize("1/2 Dozen Bagels"),
  ],
  [
    targetKey("chasin-tails-seafood-that-celebrates-falls-church-va-dc-metro", "blue-catfish-tacos"),
    normalize("Hand-battered Chesapeake Bay wild blue , catfish filets; served with creamy avocado and sriracha honey aioli. Fried Shrimp Tacos Hand-battered, served with creamy avocado and sriracha honey aioli."),
  ],
  [
    targetKey("lebanese-taverna-silver-spring-dc-metro", "chicken-samosa-2"),
    normalize("rotisserie sliced chicken, grilled onion, cilantro, almonds"),
  ],
  [
    targetKey("rocklands-bbq-dc", "veggie-burger"),
    normalize("(September Special) Logan's Bratwurst Sauerkraut, Spicy Mustard BBQ sauce, Pretzel roll. Entree Salads"),
  ],
  [
    targetKey("aroma-pizza-lorton-dc-metro", "half-tray-shrimp-alfredo-pasta"),
    normalize("large any pizza from menu 5 XLarge any pizza from menu DRINKS"),
  ],
  [targetKey("chain-pizza-boli-s", "fish-filet"), normalize("Veggie Sub")],
  [targetKey("highlands-dc", "chocolate-lava-cake"), normalize("creme bruleé")],
  [
    targetKey("north-italia-reston-va", "strawberries-and-cream-french-toast"),
    normalize("AMERICANO* with fried eggs & bacon AMERICANO* with fried eggs & prosciutto AMERICANO* with scrambled eggs & bacon AMERICANO* with scrambled eggs & prosciutto EGGS IN PURGATORY"),
  ],
  [
    targetKey("peter-chang-arlington-va", "chicken-in-szechuan-hot-and-numbing-sauce"),
    normalize("Beef / Fish"),
  ],
  [targetKey("peter-chang-arlington-va", "guan-zhong-lamb-skewer"), normalize("Original / Spicy")],
  [targetKey("peter-chang-arlington-va", "pork-dumplings-6"), normalize("Steamed / Pan-Fried")],
  [
    targetKey("peter-chang-arlington-va", "sauteed-diced-chicken-w-szechuan-chili-pepper"),
    normalize("Bone / Boneless"),
  ],
  [
    targetKey("peter-chang-arlington-va", "side-rice"),
    normalize("Combination - Chicken, Beef, Shrimp; Yangzhou - Traditional Chinese fried rice with egg, mixed vegetables, and white pepper, no soy sauce"),
  ],
  [
    targetKey("raku-bethesda-md", "aspara-avocado-q-7-gluten-free"),
    normalize("6 PCS: Asparagus | Avocado | Cucumber CRUNCHY AVO-Q 7 Gluten Free 6 PCS: Avocado | Cucumber | Tempura Flakes"),
  ],
  [
    targetKey("raku-bethesda-md", "crunchy-spicy-scallop"),
    normalize("6 PCS: Mayo | Scallion | Fish Roe | Tempura Flakes CRUNCHY EEL 6 PCS: Oshinko (Pickled Daikon) | Cucumber CRUNCHY SPICY TORO 8 PCS: Toro | Oshinko | Jalapeno | Ginger | Cilantro | Sriracha"),
  ],
  [
    targetKey("raku-bethesda-md", "harasu-10-gluten-free"),
    normalize("5 PCS: Salmon Belly | Shiso | Oshinko | Ginger PHILLY 10 Gluten Free 8 PCS: Smoked Salmon | Cream Cheese | Red Onion | Cucumber | Shiso | Lemon Caper Sauce"),
  ],
  [
    targetKey("raku-bethesda-md", "shrimp-california"),
    normalize("6 PCS: Avocado | Cucumber | Fish Roe CALIFORNIA 6 PCS: Avocado | Cucumber | Crab Stick | Fish Roe"),
  ],
  [
    targetKey("raku-bethesda-md", "shrimp-tempura-roll"),
    normalize("6 PCS: Lettuce | Mayo ‘SEOUL’ TRAIN 8 PCS: Spicy Korean Miso |Tuna | Kimchee | Kaiware | Scallion"),
  ],
  [targetKey("ruthie-s-all-day-arlington-va-dc-metro", "chicken-tender-1pc"), normalize("Avocado Side")],
  [
    targetKey("silver-and-sons-bbq-bethesda-md", "curry-stewed-chickpeas-pt-fz"),
    normalize("Chickpeas Steeped with Black Tea and Stewed with Charred Tomato, Spinach, Ginger, Garlic, Curry Spices. Fried Chicken (fz)"),
  ],
  [
    targetKey("silver-and-sons-bbq-bethesda-md", "harissa-smoked-carrots"),
    normalize("Green Chermoula, spring onion G• DEVILED EGGS G •"),
  ],
  [
    targetKey("silver-and-sons-bbq-bethesda-md", "sandwich-platter"),
    normalize("Choice of main, sauce, side and sweet. Served on a challah bun with pickles. 2x2 Platter"),
  ],
  [
    targetKey("silver-and-sons-bbq-bethesda-md", "smores-rice-krispies-treat"),
    normalize("Smoked marshmallows, dark chocolate, brown butter Seasonal Bread Pudding brown sugar, bourbon vanilla, oat crumble Sunday Brunch Menu"),
  ],
  [
    targetKey("cafesano-reston-dc-metro", "caesar"),
    normalize("Romaine, our Caesar dressing, croutons, shaved Parmesan and our Parmesan crisp. House Romaine, baby spinach, tomatoes, cucumber, carrots & radicchio with our croutons and house dressing."),
  ],
  [
    targetKey("lost-dog-cafe-dunn-loring-fairfax-va-dc-metro", "8-the-greyhound"),
    normalize("Sliced avocado, fresh spinach, mushrooms, and tomato with melted mozzarella cheese on a warm pita with avocado ranch. 9. K-9"),
  ],
  [
    targetKey("lost-dog-cafe-dunn-loring-fairfax-va-dc-metro", "iced-tea-unsweet"),
    normalize("Hot Tea Lost Dog Cafe Locations and Hours"),
  ],
  [targetKey("red-s-table-reston-va-dc-metro", "milkshake"), normalize("Choose 1 style")],
  [targetKey("red-s-table-reston-va-dc-metro", "sauteed-spinach"), normalize("Seasonal Veggies")],
  [targetKey("suga-and-spice-hyattsville-md-dc-metro", "oxtail-rasta-pasta"), normalize("Crab Cluster 2 Cluster")],
  [targetKey("suga-and-spice-hyattsville-md-dc-metro", "steak-and-cheese"), normalize("catering orders stuff salmon")],
  [
    targetKey("sweet-crimes-bakery-dc", "blt-sandwich"),
    normalize("Inside, you’ll find the ultimate flavor squad: It’s the perfect dream team of flavor! Plus, it’s totally nut-free and contains soy to keep everything delicious."),
  ],
  [
    targetKey("sweet-leaf-mclean-dc-metro", "elote-toast"),
    normalize("avocado, corn, cilantro, pepita seeds, red pepper flakes, lime squeeze, drizzle of chipotle chile on multigrain Breakfast"),
  ],
  [
    targetKey("sweet-leaf-mclean-dc-metro", "pesto-chicken"),
    normalize("organic mesclun, romaine, ripe avocado, sun-dried tomato, fresh mozzarella, chicken breast, parmesan crisp, pesto vinaigrette REWARDS"),
  ],
  [
    targetKey("taco-bamba-fair-lakes-dc-metro", "pf-chango-chicken-taco"),
    normalize("mexi sweet and sour cauliflower, blistered long beans, rice, pickled carrot, spicy aioli, toasted sesame, soy pickled chiles, flour tortilla"),
  ],
  [
    targetKey("the-coupe-dc", "rhubarb-strawberry-pie"),
    normalize("❗To Go Service Items Choose Your To Go Order Items Here"),
  ],
  [
    targetKey("the-flying-mexican-washington-dc-dc-metro", "cheese"),
    normalize("Quesadillas are served on two flour tortillas. Add sour cream +3 or guacamole +3"),
  ],
  [
    targetKey("the-flying-mexican-washington-dc-dc-metro", "veggie-portabella-burrito"),
    normalize("Quesadillas Chihuahua cheese, your choice of protein, pico de gallo, crema fresca"),
  ],
  [targetKey("bombay-street-food-capitol-hill-dc", "garlic-naan"), normalize("Bombay Street Food")],
  [
    targetKey("buena-vida-gastrolounge-arlington-va-dc-metro", "tg-signature-fajitas"),
    normalize("ALL DAY MENU D - For The Table Chips & Salsa House Salsa Sampler With Chips"),
  ],
  [targetKey("green-pig-bistro-arlington-va-dc-metro", "truffle-french-fries"), normalize("sausage egg")],
  ...[
    "smoked-beef-shank",
    "smoked-brisket-prime-angus-beef",
    "smoked-lamb-neck",
    "smoked-lamb-shoulder",
    "smoked-short-ribs-prime-angus-beef",
  ].map((itemId) => [
    targetKey("kanoon-smoked-meat-and-steakhouse-restaurant-owner-herndon-va-dc-metro", itemId),
    normalize("$34.99/lb"),
  ]),
  [
    targetKey("noma-pizza-dc", "cheese"),
    normalize("Steak, mozzarella, tomatoes, red onions, mushrooms, green peppers, lettuce and Italian dressing"),
  ],
  [targetKey("osteria-marzano-alexandria-va-dc-metro", "mussels-pei"), normalize("Choose preparation style")],
  [targetKey("osteria-marzano-alexandria-va-dc-metro", "risotto-of-the-day"), normalize("Ask your server")],
  [targetKey("osteria-marzano-alexandria-va-dc-metro", "soup-of-the-day"), normalize("Ask your server")],
  [targetKey("passionfish-reston-reston-va-dc-metro", "sashimi-assortment"), normalize("Six Pieces")],
  [
    targetKey("passionfish-reston-reston-va-dc-metro", "sweet-potato-fries"),
    normalize("Menu PDF item listed under Sides."),
  ],
  [
    targetKey("teddy-and-the-bully-bar-washington-dc-dc-metro", "home-fries"),
    normalize("Not included in the bottomless experience."),
  ],
  [
    targetKey("the-bungalow-lakehouse-sterling-va-dc-metro", "signature-wings-and-starters"),
    normalize("10 PIECE 1735 gf 20 PIECE 2935 gf celery, carrots, choice of roasted garlic ranch or bleu cheese dressing"),
  ],
  [
    targetKey("the-burger-shack-ashburn-dc-metro", "tenders-and-fish"),
    normalize("3 Piece Tenders 5 Piece Tenders 3 Piece Cod"),
  ],
  [targetKey("the-queen-vic-washington-dc-dc-metro", "daily-vegan-curry-vegan"), normalize("helper text")],
  [
    targetKey("booeymonger-friendship-heights-dc", "create-your-own-sandwich"),
    normalize("Hot Dog 2 Hot Dogs"),
  ],
  [
    targetKey("booeymonger-friendship-heights-dc", "mr-bs-french-toast"),
    normalize("2 pieces of fresh made French toast garnished with fresh Strawberries, butter and syrup on the side 3 Buttermilk Pancakes"),
  ],
  [targetKey("daily-provisions-dupont-dc", "mocha"), normalize("Hot Tea Hot Tea 12oz Hot Tea 16oz")],
  [
    targetKey("joon-dc", "barg-and-eggsor55"),
    normalize("filetmignon**kabob,twofriedeggs**, Joonfries,torshiremoulade"),
  ],
  [
    targetKey("joon-dc", "pistachio-soup"),
    normalize("barberries,crispyonions barberries,crispyonions"),
  ],
  [
    targetKey(
      "maharani-palace-fine-indian-cuisine-and-bar-herndon-va-dc-metro",
      "hendricks-fresh-lime-juice-dash-of-simple-syrup-fresh-serrano-limca",
    ),
    normalize("These are two drink combinations: Hendrick’s, rose water, a dash of lime juice, Rooh Afza, gin infused with paan liqueur, and green crème de menthe, served with mitha paan"),
  ],
  [
    targetKey(
      "maharani-palace-fine-indian-cuisine-and-bar-herndon-va-dc-metro",
      "light-cheese-balls-dipped-in-a-cinnamon-avored-sugar-syrup",
    ),
    normalize("Balls of Chhena soaked in Malai, ﬂavored with sugar syrup, milk, saﬀron, and pistachios, with Kheer as stuﬃng"),
  ],
  [targetKey("el-patio-randolph-rockville-md-dc-metro", "baked-classics-each"), normalize("Regular Sized")],
  [targetKey("el-patio-randolph-rockville-md-dc-metro", "molleja"), normalize("Sweet Bread")],
  [targetKey("el-patio-randolph-rockville-md-dc-metro", "mollejas"), normalize("Grilled sweet bread")],
  [
    targetKey("llamabar-navy-yard-dc", "blueberry-muffin"),
    normalize("croissant bagel Drink Menu Wine Pinot Noir"),
  ],
  [targetKey("llamabar-navy-yard-dc", "honey-roasted-peanuts"), normalize("Eggs 2. Eggs mixed berries")],
  [
    targetKey("miss-toya-s-creole-house-silver-spring-md-dc-metro", "oysters-on-the-half-shell"),
    normalize("Minimum of 6"),
  ],
  [targetKey("problem-child-navy-yard-dc", "rocket-popsicle"), normalize("Chowly Open Item Menu")],
  [
    targetKey("virtue-feed-and-grain-alexandria-va-dc-metro", "irish-coffee"),
    normalize("Lavender French Lavender Limoncello Spritz"),
  ],
  [
    targetKey("buffalo-bergen-cleveland-park-dc", "french-fries"),
    normalize("Live, Love, Latkes 3 potato latkes w/ bourbon applesauce, peppered creme fraiche & chives"),
  ],
  [
    targetKey("buffalo-bergen-cleveland-park-dc", "side-cream-cheese-flavored"),
    normalize("COCKTAILS, BEER & WINE SIGNATURE COCKTAILS"),
  ],
  [
    targetKey("buffalo-bergen-union-market-dc", "tuna-salad-and-bagel-chips"),
    normalize("COCKTAILS, BEER & WINE* COCKTAILS Have any of our cocktails To-Go!!"),
  ],
  [
    targetKey("clydes-georgetown-dc", "brownie-sundae"),
    normalize("with whipped cream Kids Menu"),
  ],
  [
    targetKey("dacha-beer-garden-shaw-washington-dc-dc-metro", "hh-skinny-burger"),
    normalize("single patty, creole mustard, cheddar cheese, LTO, pickles, fries +$3 maple glazed bacon"),
  ],
  [
    targetKey("dacha-beer-garden-shaw-washington-dc-dc-metro", "original-doner"),
    normalize("thinly sliced beef, garlic & fresh herbs, pickled onions, spiced sauce, pita pocket. Lettuce side salad with olive oil & salt. (contains soy)"),
  ],
  [targetKey("guacado-laurel-dc-metro", "chicken-birria-pie"), normalize("Kid's Menu")],
  [targetKey("guacado-laurel-dc-metro", "fries-large"), normalize("suace 8 oz")],
  [
    targetKey("guacado-laurel-dc-metro", "rice-and-beans"),
    normalize("extra protein 4 oz tostada"),
  ],
  [targetKey("guacado-laurel-dc-metro", "taco-salad"), normalize("Nachos Quesadilla")],
  [targetKey("roots-cafe-mclean-dc-metro", "bacon"), normalize("Fried Egg 2 Pork Sausage")],
  [
    targetKey("roots-cafe-mclean-dc-metro", "classic-caesar-salad"),
    normalize("Chicken Caesar Salad, Aged Parmesan, Hearts of Romaine, Croutons, Tomato, Chicken, Roots Caesar Dressing"),
  ],
  // Round 17 manual review: these values are demonstrably shifted sibling
  // rows, truncated captures, or option metadata rather than descriptions.
  [
    targetKey("osm-1983-chinese-cuisine-10746777097", "wasabi-shrimp"),
    normalize("Pickled Radish Pickled Cucumber"),
  ],
  [targetKey("osm-karahi-boys-13475305897", "garlic-naan"), normalize("Zeera Rice")],
  [
    targetKey("kizuna-sushi-ramen-tysons-va", "menma-bamboo-shoots"),
    normalize("1/2 Hanjuku ‘LAVA’ Egg* 1.5"),
  ],
  [
    targetKey("replacement-mama-chang-fairfax-va", "stir-fried-green-beans"),
    normalize("Mustard greens"),
  ],
  [
    targetKey("replacement-mama-chang-fairfax-va", "veggie-spring-rolls-3"),
    normalize("illed with cabbage, carrots, green beans, glass noodles, onions, ginger, garlic, and sesame oil"),
  ],
  [
    targetKey("replacement-southeast-impression-fairfax-va", "duck-wrap"),
    normalize("Fried Calamari Fried Tofu Fried Wontons"),
  ],
  [
    targetKey("tiger-dumplings-arlington-va", "broccoli-stir-fried-chicken"),
    normalize("Beef mixed with Vegetables in Spicy Broth 水煮牛肉 Ginger, garlic, scallion, dry pepper, celery, napa, cilantro"),
  ],
  [
    targetKey("tiger-dumplings-arlington-va", "grilled-chicken-chop-noodle-soup"),
    normalize("Braised Beef Noodle Soup"),
  ],
  [
    targetKey("tiger-dumplings-arlington-va", "sassy-beef-shank-salad"),
    normalize("Five Spices Marinated Beef Shank is a tender, flavorful dish featuring slow-cooked beef shank marinated in a blend of aromatic five spices, delivering a savory, fragrant, and richly seasoned taste with every bite. Served in cold"),
  ],
  [
    targetKey("tiger-dumplings-arlington-va", "shrimp-wonton-soup-6"),
    normalize("Shrimp Wonton Soup features tender, delicate wontons filled with shrimp, offering a light, flavorful (6 pieces)."),
  ],
  [
    targetKey("tiger-dumplings-arlington-va", "vegetable-spring-roll-3"),
    normalize("Vegetable Spring Rolls are crispy, golden-fried rolls filled with a savory mix of fresh vegetables like cabbage, carrots, and mushrooms, offering a light and flavorful crunch in every bite. (2 pieces)."),
  ],
  // Round 18 manual review: sourcing badges, shifted sibling copy, and a
  // visibly truncated menu row are not useful or safe item descriptions.
  [targetKey("osm-roll-play-10661106334", "beef-brisket-gf"), normalize("Grass-Fed")],
  [
    targetKey("osm-roll-play-10661106334", "berkshire-pork-belly-gf"),
    normalize("Pasture-Raised"),
  ],
  [
    targetKey("barcelona-wine-bar-reston-va", "prod-paella-verduras"),
    normalize("Zucchini, Yellow squash, snow peas, Mushrooms, Piquillo peppers 19 /"),
  ],
  [
    targetKey("barcelona-wine-bar-reston-va", "paella-verduras"),
    normalize("Zucchini, Yellow squash, snow peas, Mushrooms, Piquillo peppers 19 /"),
  ],
  [
    targetKey("barcelona-wine-bar-reston-va", "alisios"),
    normalize("Islas Canarias, ES Semi-Firm, Cow & Goat's Milk, Aged Months. Pimentón, spice, brothy."),
  ],
  [
    targetKey("replacement-eleni-s-greek-taverna-springfield-va", "calamari"),
    normalize("Lightly Breaded And Fried, Served With Marinara Sauce Spanakopita Fresh Spinach, Dill And Feta Cheese In Phyllo"),
  ],
  [
    targetKey("replacement-his-and-hers-washington-dc", "seafood-fried-rice"),
    normalize("Seasonal Veggies"),
  ],
  // Round 25 manual review: placeholders, truncated prompts, and visibly
  // shifted or merged neighboring rows must not enter the recovery overlay.
  [targetKey("sticky-fingers-bakery-dc", "blondie"), normalize("No substitutions.")],
  [targetKey("sticky-fingers-bakery-dc", "chocolate-chip-cookie"), normalize("No substitutions.")],
  [targetKey("sticky-fingers-bakery-dc", "crumb-cake-slice"), normalize("No substitutions.")],
  [
    targetKey("osm-flower-child-6327602834", "cookie-brownie-duo"),
    normalize("feeds 10-12 people CHOOSE YOUR SIDE"),
  ],
  [
    targetKey("ford-s-fish-shack-ashburn-va-dc-metro", "fords-full-rack"),
    normalize("1¼ Lb Steamed Lobstah MP Grilled Corn, Coleslaw"),
  ],
  [
    targetKey("susheria-washington-dc-dc-metro", "latino-heat"),
    normalize("Pineapple, Jalapenos, Cucumber, Cilantro, Fresh Lime Juice, Agave Nectar, Egg White Japanese Fizz Lychee, Pandan, Yuzu Juice, Soda Water"),
  ],
  [
    targetKey("replacement-taco-cantina-dc-mexican-grill-washington-dc", "steak-eggs-rice-beans-and-avocado"),
    normalize("Fried corn tortilla, eggs, sour cream, pico de gallo, queso fresco, red and green sauce"),
  ],
  [
    targetKey("replacement-taco-cantina-dc-mexican-grill-washington-dc", "torta"),
    normalize("Traditional Mexican sandwich with beans, lettuce, tomato, guacamole, jalapenos, and cheese | Add on Meat Options 3 Putaco Combo"),
  ],
  [
    targetKey("replacement-preservation-biscuit-company-falls-church-va", "12-dozen-vegan-biscuits"),
    normalize("Please give us"),
  ],
  [
    targetKey("replacement-preservation-biscuit-company-falls-church-va", "dozen-vegan-biscuits"),
    normalize("Please give us"),
  ],
  // Round 29 manual review: retain the useful source-backed portion of these
  // rows while rejecting duplicated titles, neighboring sections, prices,
  // and ordering notes introduced by the generic HTML extractors.
  [
    targetKey("osm-ted-s-montana-2414839960", "balsamic-blue-steak"),
    normalize("Balsamic Blue Steak Sirloin, iceberg, romaine, organic spring mix, cucumber, blue cheese, bacon, vine-ripened tomato, balsamic reduction, onion strawsBeef | Bison"),
  ],
  [
    targetKey("osm-ted-s-montana-2414839960", "chicken-chopped"),
    normalize("Iceberg, grilled chicken, roasted corn, garbanzo beans, vine-ripened tomato, green pepper, red onion, fresh chopped basil, cucumber, bacon, fresh basil vinaigrette Traditional Ranch, Basil Vinaigrette, Lemon Vinaigrette, Blue Cheese, Honey Mustard, “Eggless” Caesar and Olive Oil & Red Wine Vinegar"),
  ],
  [
    targetKey("osm-ted-s-montana-2414839960", "knife-and-fork-chili-cheese"),
    normalize("Pepper jack, cheddar, bison chili, tomato, jalapeño, red onion, sour cream, ciabatta | Beef | Bison"),
  ],
  [
    targetKey("osm-blue-ocean-japanese-6281378373", "iidako-karaage"),
    normalize("Fried baby octopus. Appetizer | Steamed or Cooked"),
  ],
  [
    targetKey("osm-blue-ocean-japanese-6281378373", "oshinko"),
    normalize("Oshinko - Assorted pickled vegetables - $8"),
  ],
  [
    targetKey("osm-blue-ocean-japanese-6281378373", "okonomiyaki"),
    normalize("shrimp, pork, squid, & cabbage mix in batter, pan fried, & topped with bonito flake, ginger, mayo & okonomiyaki sauce.**********Reservation required 1 day in advanced"),
  ],
  [
    targetKey("osm-blue-ocean-japanese-6281378373", "chicken-dark-meat"),
    normalize("Teriyaki or Shioyaki $19.00"),
  ],
  [
    targetKey("osm-blue-ocean-japanese-6281378373", "spicy-chicken-dark-meat"),
    normalize("Teriyaki or Shioyaki $19.00"),
  ],
  [
    targetKey("pizzeria-paradiso-hyattsville-md", "antipasti-choose-three"),
    normalize("Roasted Vegetables: Artichokes, Broccoli Rabe, Eggplant, Escarole Cured Meats: Mortadella, Prosciutto di Parma, Salami, Spicy CapocolloCheeses: Buffalo Mozzarella, Gorgonzola, Goat Cheese, Pecorino"),
  ],
  // Round 30 manual review: replace misspelled or visibly truncated source
  // values with faithful, item-bounded copy from the same official surface.
  [targetKey("osm-burger-shack-9421511261", "v-beyond-burger"), normalize("Pant Based- Vegan")],
  [targetKey("osm-burger-shack-9421511261", "v-portabella-cap-burger"), normalize("Caramelized Onion- Vegan")],
  [targetKey("osm-el-golfo-4957750893", "tapas-mixtas-gf"), normalize("Chicken, steak, chicharron, yucca, shrimp, ceviche mixto Large")],
  [targetKey("ometeo-tysons-va", "aves-con-todo-fajita-chicken"), normalize("Poultry Trio- Grilled Chicken Breast, Duck carnitas, & Chicken Thigh served with Onions, Poblanos, Grilled Jalapeño, Nopales, Chihuahua Cheese, Salsa Frita, Crema, Arroz Rojo, Frijoles Refritos (contains pork) and Homemade Heirloom Corn & Flour")],
  [targetKey("ometeo-tysons-va", "aves-fajita-chicken"), normalize("Grilled Chicken Breast served with Onions, Poblanos, Grilled Jalapeño, Nopales, Chihuahua Cheese, Salsa Frita, Crema, Arroz Rojo, Frijoles Refritos (contains pork) and Homemade Heirloom Corn & Flour")],
  [targetKey("ometeo-tysons-va", "cerdo-con-todo-fajita-pork"), normalize("Pork Trio- Braised Pork Shoulder Carnitas, Jalapeño-Cheddar Chorizo, & Smoked Spare Ribs served with Onions, Poblanos, Grilled Jalapeño, Nopales, Chihuahua Cheese, Salsa Frita, Crema, Arroz Rojo, Frijoles Refritos (contains pork) and Homemade Heirloom Corn & Flour")],
  [targetKey("ometeo-tysons-va", "de-res-con-todo-fajita-beef"), normalize("Beef Trio- Grilled Skirt steak, Bone-in Short Rib, & Suadero (Beef Belly). Served with: Onions, Poblanos, Grilled Jalapeño, Nopales, Chihuahua Cheese, Salsa Frita, Crema, Arroz Rojo, Frijoles Refritos (contains pork) and Homemade Heirloom Corn & Flour")],
  [targetKey("ometeo-tysons-va", "mar-fajita-shrimp"), normalize("Seared Shrimp served with Onions, Poblanos, Grilled Jalapeño, Nopales, Chihuahua Cheese, Salsa Frita, Crema, Arroz Rojo, Frijoles Refritos (contains pork) and Homemade Heirloom Corn & Flour")],
  [
    targetKey("ometeo-tysons-va", "tex-mex-burger"),
    [
      normalize("4oz. Double Stack Patties, Caramelized Onions, Pepper Jack Cheese, Tex-Mex Thousand Island, Dill Pickles, Jalapeño Pickles, Tomato, Iceberg Lettuce, Fries"),
      normalize("4 oz Double stack patties, caramelized onions, pepper jack cheese, Tex-Mex Thousand Island, dill pickles, jalapeño pickles, tomato, iceberg lettuce, and fries."),
    ],
  ],
  // Round 31 manual review: suppress only these damaged raw values so the
  // complete reviewed official descriptions below can replace them.
  [targetKey("burtons-grill-and-bar-washington-dc-dc-metro", "classic-burger"), normalize("allen brothers angus beef, lettuce, tomato, red onions, pickles, choice of cheese, brioche bun, french fries make it a maxx burger")],
  [targetKey("burtons-grill-and-bar-washington-dc-dc-metro", "veggie-burger"), normalize("17.5 our secret recipe, avocado, spinach, tomato, cheddar, lemon aioli, brioche bun, french fries California Chicken Sandwich bronzed chicken, black forest ham, guacamole, pepper jack, chipotle aioli, ciabatta roll, french fries")],
  [targetKey("burtons-grill-and-bar-washington-dc-dc-metro", "superfood"), normalize("18.5 spinach, avocado, quinoa, grape tomatoes, julienned vegetables, feta, dried cranberries, lemon vinaigrette Greek mixed field greens, cucumbers, grape tomatoes, red onions, olives, feta, seasoned pita crisps, greek dressing")],
  [targetKey("makers-union-reston-va", "alfredo-pasta"), normalize("gruyere-parmesan cream sauce, linguini, garlic bread chicken")],
  [targetKey("replacement-apapacho-taqueria-washington-dc", "el-tacote"), normalize("Flour tortilla, grilled ny steak, chicharron, chihuahua cheese, avocado puree, pico de gallo)")],
  [targetKey("replacement-apapacho-taqueria-washington-dc", "tortilla-soup"), normalize("Homemadetomatoes broth, avocado, tortilla strips , queso fresco, epazote, chile pasilla")],
  // Round 32 reviewed repairs for complete official rows with obvious OCR or
  // boundary damage in the raw capture.
  [targetKey("lapis-dc", "mixed-grill"), normalize("hicken, lamb, & steak")],
  [targetKey("lapis-dc", "nask-soup"), normalize("Yellow Lentals & veggies")],
  [targetKey("replacement-masala-art-washington-dc", "rice-kheer"), normalize("the famous rice pudding Sorbet – Mango OR Lemon (DF, GF, VG) Every Saturday 1130am -230pm")],
  // Round 33 reviewed cleanup of otherwise useful official descriptions.
  [targetKey("officina-wharf-dc", "chicken-salsiccia"), normalize("3 Apple Chicken Sausage.")],
  [targetKey("officina-wharf-dc", "smoked-bacon"), normalize("5 Slab Smoked Bacon")],
  [targetKey("quarterdeck-arlington-va-dc-metro", "crab-cake-sliders"), normalize("Four crab cake")],
  [targetKey("replacement-tap99-washington-dc", "bruschetta-nachos"), normalize("VIPE RIPE TOMATOES + BALSAMIC GLAZE + EVOO + BASIL + PARMESAN HERB CROSTINIS")],
  // Round 42: suppress source-boundary artifacts and fulfillment/price metadata.
  [targetKey("mission-navy-yard-washington-dc-dc-metro", "chips-and-salsa"), normalize("n/g/e/s/v/vg/d")],
  [targetKey("replacement-cynthia-bar-and-bistro-washington-dc", "drip-coffee-or-espresso"), normalize("www.CynthiaDC.com/Events")],
  [targetKey("replacement-cynthia-bar-and-bistro-washington-dc", "brunch-smashburger"), normalize("fried egg, cheddar, LTO, pickle, Cynthia sauce, served with home fries or fruit (add bacon | 5)")],
  ...[
    ["hangover-lo-mein-s", "Sautéed Lo Mein with chicken onions, carrots, cherry tomatoes, finger, peppers, and bell peppers, in a spicy basil and Sriracha sauce.FLANK STEAK 25 | Shrimp 25 | Seafood 27"],
    ["jungle-lover-s", "Sautéed with red curry paste, bamboo shoots,eggplant, green beans, young peppercorns, bell peppers, and basil.Chicken, Pork or Tofu 22Flank Steak or Shrimps 26"],
    ["lychee-thai-tea", "(No Refill)"],
    ["milk-tea", "R: 6.50 B: 7.50"],
    ["roti-massaman-curry-s", "Sautéed Massaman curry paste with coconut milk, carrots, onions, potatoes, peanuts, and fried shallots, served with roti (Indian bread).Chicken 25 | Flank Steak 27"],
    ["thai-coffee", "R: 7.00 B: 8.00"],
    ["thai-tea", "R: 7.00 B: 8.00"],
    ["thai-tea-latte", "I: 7.50 H: 6.50"],
    ["thai-tea-matcha", "R: 8.00 B: 9.00"],
  ].map(([itemId, value]) => [targetKey("osm-dok-khao-10728675757", itemId), normalize(value)]),
  ...[
    ["bg02-iced-myanmar-coffee", "Order from Toast, Uber DoorDash or Grubhub!"],
    ["cf09-mote-nyinchin-htamin-gyaw", "Sour mustard stir fried with jasmine rice with a choice off tofu, chicken, pork, beef, pork belly, shrimp, or egg ( only Choose one item only ) Order from Toast, Uber DoorDash or Grubhub!"],
    ["rice-noodle", "04. Hingar"],
    ["s05-theesone-hin-kyet", "Vegetable soup with string beans, okra, eggplant, potato, carrot, and yellow split peas and chicken strips ( dark meat ) Order from Toast, Uber DoorDash or Grubhub!"],
  ].map(([itemId, value]) => [targetKey("mandalay-silver-spring-md", itemId), normalize(value)]),
  [targetKey("kyojin-dc", "egg-omelet"), normalize("FRESH WASABI")],
  [targetKey("kyojin-dc", "salmon-lover-roll"), normalize("salmon, avocado, mango salsa, mango tobiko sauce, creamy jalapeño sauce, tempura bits THE EVE OF HONOR Citron Vodka | Peach Schnapps | Lillet Blanc |")],
  [targetKey("osm-la-brasita-10119939334", "fajita-salmon-y-camaron"), normalize("grilled salmon, shrimp, served on a bed of vegetables with yellow rice, red beans, sour cream, pico de gallo, guacamole, flour tortillas Starters")],
  ...[
    ["corn-and-spinach-shakshuka", "Poached eggs in a creamy corn sauce, with baby spinach and zucchini, topped with heirloom cherry tomatoes, feta cheese, zhoug, Aleppo chili oil, and parsley. Served with housemade sourdough. (1230 cal, Contains: Wheat, Milk, Egg)"],
    ["grab-and-go-overnight-oats-with-roasted-peach-and-raspberry", "Overnight oats served with roasted peaches, fresh raspberries, apricot jam, and topped with toasted pistachios and honey. (500 cal, Contains: Tree Nuts (Pistachio))"],
    ["overnight-oats-with-roasted-peach-and-raspberry", "Overnight oats served with roasted peaches, fresh raspberries, apricot jam, and topped with toasted pistachios and honey. (500 cal, Contains: Tree Nuts (Pistachio))"],
    ["strawberry-roasted-peach-and-chicken-salad", "Mixed lettuces, baby spinach, fresh strawberries, roasted peaches, red onion, roasted chicken, topped with toasted cashews, goat cheese, and served with a balsamic dressing. (670 cal, Contains: Wheat, Milk, Egg, Tree Nuts (Cashew))"],
    ["tahini-caesar-salad", "Little Gem romaine lettuce and zaatar croutons tossed with Tahini Caesar dressing topped with heirloom cherry tomatoes, sliced radish, shaved parmesan, fresh mint , finished with sumac and cracked black pepper . (390 cal. Contains: Wheat, Milk, Sesame, Egg, Fish)"],
  ].map(([itemId, value]) => [targetKey("tatte-dc", itemId), normalize(value)]),
  [targetKey("vace-italian-delicatessen-bethesda-md", "home-made-products"), normalize("At Vace, we take pride in offering a menu filled with homemade Italian delights crafted with Mr. Calcagno's authentic recipes that have been cherished since 1976. From our handmade fresh and dry pastas in a variety of flavors and cuts to our frozen stuffed pasta options like Manicotti, Ravioli and Tortellini, each item is made with care and tradition. Our homemade sauces and frozen entrees, such as Lasagna and Stuffed Shells, are prepared with the same dedication to quality and taste. Click below to explore our full menu and experience the true essence of Italian cuisine at Vace.")],
  ...[
    ["all-sandwiches-served-with-a-pickle-and-farm-fries", "Cheddar Cheese, Bacon, Wild Mushroom Sauté, Crispy Onions, Lettuce, Tomato, Everything Sauce, Ciabatta Bun"],
    ["cheese", "Cheddar or Mozzarella"],
    ["romaine-parmesan-garlic-herb-croutons-caesar-dressing", "Baby Iceberg, Heirloom Cherry Tomato, Red Onion, Bacon, Smoked Blue Cheese Dressing, Chives"],
    ["veggies", "Onions, Bell Peppers, Jalapeño Peppers, Tomato, Mushrooms, Spinach"],
  ].map(([itemId, value]) => [targetKey("replacement-the-farmhouse-tuscan-alexandria-va", itemId), normalize(value)]),
]);
const knownExtractionArtifactTargets = new Set([
  targetKey("blue-ridge-seafood-restaurant-gainesville-va", "onion-rings"),
  targetKey("blue-ridge-seafood-restaurant-gainesville-va", "spiced-shrimp-lb-mp"),
  targetKey("buena-vida-gastrolounge-arlington-va-dc-metro", "passion-fruit-lemonade"),
  targetKey("la-casita-pupusas-dc", "bandeja-vecino"),
  targetKey("circa-foggy-bottom-dc", "garlic-mashed-potatoes"),
  targetKey("darvish-kitchen-washington-dc-dc-metro", "baby-spinach-salad"),
  targetKey("sweet-leaf-arlington", "chicken-caesar"),
  targetKey("sweet-leaf-arlington", "strawberry-cucumber-mint"),
  targetKey("sweet-leaf-arlington", "avo-mix"),
  targetKey("the-mount-vernon-inn-restaurant-washington-dc-dc-metro", "belgian-waffle"),
  targetKey("the-smith-penn-quarter-dc", "apple-smoked-bacon"),
  targetKey("the-smith-penn-quarter-dc", "birthday-girl"),
  targetKey("the-smith-penn-quarter-dc", "east-beach-blonde"),
  targetKey("the-smith-penn-quarter-dc", "filet-mignon"),
  targetKey("the-smith-penn-quarter-dc", "garlic-whipped-potatoes"),
  targetKey("the-smith-penn-quarter-dc", "mac-cheese"),
  targetKey("the-smith-penn-quarter-dc", "matcha-latte"),
  targetKey("the-smith-penn-quarter-dc", "oyster-of-the-day"),
  targetKey("the-smith-penn-quarter-dc", "puffer-petite"),
  targetKey("redstone-american-grill-washington-dc-dc-metro", "cajun-ribeye"),
  // Round 15 manual review: these candidates are demonstrably adjacent-row,
  // promotional, placeholder, or truncated extraction artifacts.
  targetKey("cactus-cantina-dc", "gallon-beans"),
  targetKey("cactus-cantina-dc", "p-virgin-peach"),
  targetKey("chima-steakhouse-tysons-tysons-va-dc-metro", "full-rodizio"),
  targetKey("chima-steakhouse-tysons-tysons-va-dc-metro", "gourmet-salad-bar"),
  targetKey("tom-s-watch-bar-national-harbor-washington-dc-dc-metro", "crispy-pickle-chips-buttermilk-ranch-dressing"),
  targetKey("tom-s-watch-bar-navy-yard-washington-dc-dc-metro", "crispy-pickle-chips-buttermilk-ranch-dressing"),
  targetKey("blackwall-hitch-alexandria-va-dc-metro", "farm-fresh-egg-station-made-to-order-omelets"),
  targetKey("shaw-s-tavern-washington-dc-dc-metro", "club-sandwich"),
  targetKey("shaw-s-tavern-washington-dc-dc-metro", "two-eggs-any-style"),
  targetKey("salt-and-vine-washington-dc-dc-metro", "cheese-and-charcuterie-pick"),
  targetKey("salt-and-vine-washington-dc-dc-metro", "potato-rosti"),
  targetKey("salt-and-vine-washington-dc-dc-metro", "any-style-egg"),
  targetKey("salt-and-vine-washington-dc-dc-metro", "side-caesar-salad"),
  targetKey("salt-and-vine-washington-dc-dc-metro", "pepperoni"),
  targetKey("salt-and-vine-washington-dc-dc-metro", "tagliatelle-al-funghi"),
  targetKey("salt-and-vine-washington-dc-dc-metro", "chicken-milanese"),
  targetKey("salt-and-vine-washington-dc-dc-metro", "rack-of-lamb"),
  targetKey("salt-and-vine-washington-dc-dc-metro", "badia-a-coltibuono-vin-santo"),
  targetKey("pines-of-florence-arlington-va-dc-metro", "pizza-arugula"),
  targetKey("all-set-restaurant-and-bar-silver-spring-md-dc-metro", "bacon-gf"),
  targetKey("all-set-restaurant-and-bar-silver-spring-md-dc-metro", "cajun-home-fries-gf"),
  targetKey("all-set-restaurant-and-bar-silver-spring-md-dc-metro", "scrambled-eggs-gf"),
  targetKey("all-set-restaurant-and-bar-silver-spring-md-dc-metro", "chipotle-coleslaw"),
  targetKey("all-set-restaurant-and-bar-silver-spring-md-dc-metro", "coleslaw-gf"),
  targetKey("all-set-restaurant-and-bar-silver-spring-md-dc-metro", "french-fries-gf"),
  targetKey("all-set-restaurant-and-bar-silver-spring-md-dc-metro", "garlic-string-beans-gf"),
  targetKey("all-set-restaurant-and-bar-silver-spring-md-dc-metro", "mashed-potatoes-gf"),
  // Round 19 manual review: shifted sibling rows, section bleed, product-page
  // redirects, promotional entries, and visibly truncated values are excluded.
  targetKey("blue-ridge-seafood-restaurant-gainesville-va", "homemade-mac-and-cheese-with-fresh-lobster-meat"),
  targetKey("blue-ridge-seafood-restaurant-gainesville-va", "shrimp-poboy"),
  targetKey("blue-ridge-seafood-restaurant-gainesville-va", "steamed-king-crab-legs"),
  targetKey("chain-peet-s-coffee", "vanilla-protein-latte"),
  targetKey("chain-peet-s-coffee", "iced-vanilla-protein-latte"),
  targetKey("chain-peet-s-coffee", "golden-protein-latte"),
  targetKey("chain-peet-s-coffee", "iced-golden-protein-latte"),
  targetKey("chain-peet-s-coffee", "matcha-protein-latte"),
  targetKey("chain-peet-s-coffee", "iced-matcha-protein-latte"),
  targetKey("nobu-dc", "soft-shell-crab"),
  targetKey("osm-bombay-bites-11386303146", "lamb-curry"),
  targetKey("osm-ichiban-izakaya-12207907591", "oyako-don"),
  targetKey("osm-mccormick-schmick-s-3819749757", "barnstable-massachusetts"),
  targetKey("osm-mccormick-schmick-s-3819749757", "crispy-shrimp-wrap"),
  targetKey("osm-mccormick-schmick-s-3819749757", "garden-vegetable-wrap"),
  targetKey("osm-mccormick-schmick-s-3819749757", "maine-lobster-tail-4-oz"),
  targetKey("osm-mccormick-schmick-s-3819749757", "smoked-andouille-hash"),
  targetKey("replacement-bombay-street-food-washington-dc", "garlic-naan"),
  targetKey("replacement-dog-daze-social-club-washington-dc", "acai-bowl"),
  targetKey("replacement-one-bar-and-grill-fairfax-va", "flank-steak"),
  targetKey("replacement-one-bar-and-grill-fairfax-va", "one-bistro-burger"),
  targetKey("replacement-one-bar-and-grill-fairfax-va", "tapas-tuesday"),
  targetKey("replacement-seray-vienna-va", "beef-shawarma"),
  targetKey("replacement-seray-vienna-va", "soup-of-the-day"),
  targetKey("replacement-seray-vienna-va", "spinach-pie-vg-n"),
  targetKey("replacement-seray-vienna-va", "turkish-coffee"),
  // Round 20 manual review: shifted siblings, partial text, and multi-row
  // extraction bleed must not be treated as exact description matches.
  targetKey("osm-anatolian-bistro-6230019077", "anatolian-cheese-sampler"),
  targetKey("osm-bastille-brasserie-11075705705", "daurade-a-la-marocaine"),
  targetKey("osm-kisso-asian-bistro-12207936059", "5-pcs-eel-sushi-and-eel-avocado-roll"),
  targetKey("osm-kisso-asian-bistro-12207936059", "crazy-tuna-roll"),
  targetKey("osm-kisso-asian-bistro-12207936059", "singapoore-rice-noodle"),
  targetKey("replacement-nue-elegantly-vietnamese-falls-church-va", "house-ranch-basil-oil"),
  targetKey("replacement-teaism-penn-quarter-washington-dc", "chunky-choc-pecan-salty-oat-cookie"),
  targetKey("replacement-teaism-penn-quarter-washington-dc", "togarashi-dip"),
  // Round 21 manual review: these are a category row and price-prefixed
  // extraction fragments, not descriptions of the matched menu items.
  targetKey("mejana-arlington-va", "cold-appetizers"),
  targetKey("mejana-arlington-va", "mediterranean-salad"),
  targetKey("mejana-arlington-va", "potato-kibeh"),
  // Round 23 manual review: these exact matches contain neighboring rows or
  // unrelated menu content despite being paired by the source extractor.
  targetKey("red-crab-house-laurel-md-dc-metro", "phillies"),
  targetKey("osm-casa-tequila-2697922195", "lorton-casa-nachos"),
  targetKey("osm-a-modo-mio-207944730", "ferrarelle-still-water"),
  targetKey("mussel-bar-grille-bethesda-md", "tuna-tartare"),
  targetKey("replacement-gatsby-washington-dc", "deviled-eggs-buttermilk-biscuits"),
  targetKey("replacement-noosh-grill-fairfax-va", "pita"),
  // Round 24 manual review: adjacent rows, incomplete PDF lines, navigation
  // copy, and size-only values are not item descriptions.
  targetKey("bresca-dc", "shigoku-oyster"),
  targetKey("the-hamilton-dc", "haagen-dazs-ice-cream-and-sorbet"),
  targetKey("osm-atlacatl-pupuseria-372658150", "chicken-tenders"),
  targetKey("osm-atlacatl-pupuseria-372658150", "grilled-salmon-with-cream-sauce"),
  targetKey("osm-atlacatl-pupuseria-372658150", "latest-atlacatl-news"),
  targetKey("replacement-spice-kraft-indian-bistro-arlington-va", "mint-chutney"),
  targetKey("replacement-spice-kraft-indian-bistro-arlington-va", "tamarind-chutney"),
  targetKey("replacement-milano-s-family-restaurant-springfield-va", "mini-pita"),
  // Round 26 manual review: truncated text, a section heading, and adjacent
  // bilingual PDF rows must not survive an exact-name match.
  targetKey("ozzie-s-good-eats-fairfax-va-dc-metro", "chop-house-salad"),
  targetKey("siam-house-washington-d-c-washington-dc-dc-metro", "a-unique-take-on-the-japanese-classic-infl-uence"),
  targetKey("yayla-bistro-arlington-va-dc-metro", "halloumi-breakfast-toast"),
  targetKey("peter-chang-rockville-md", "hot-and-sour-duck-soup"),
  targetKey("peter-chang-rockville-md", "lo-meincombination-chickenbeefshrimp"),
  targetKey("peter-chang-rockville-md", "scallion-bubble-pancake1"),
  targetKey("peter-chang-rockville-md", "seafood-curry-pot"),
  targetKey("peter-chang-rockville-md", "vegetable-fried-rice"),
  targetKey("replacement-thai-chef-rockville-rockville-md", "chinese-sausage-fried-rice"),
  targetKey("replacement-thai-chef-rockville-rockville-md", "crabmeat-fried-rice"),
  // Round 27 manual review: shifted side rows, private-event capacities,
  // price fragments, and a spice-level note are not menu descriptions.
  targetKey("bartaco-wharf-dc", "current-46-guacamole-chips"),
  targetKey("dcity-smokehouse-dc", "hushpuppies-large"),
  targetKey("dcity-smokehouse-dc", "potato-salad-large"),
  targetKey("dcity-smokehouse-dc", "smokey-brisket-chili-small"),
  targetKey("dcity-smokehouse-dc", "spiced-fries-large"),
  targetKey("the-monocle-dc", "ny-steak"),
  targetKey("the-monocle-dc", "vegetables-each"),
  targetKey("davios-reston-va", "arlington-room"),
  targetKey("davios-reston-va", "berkeley-room"),
  targetKey("davios-reston-va", "pizza-available-gluten-free"),
  targetKey("davios-reston-va", "washington-and-newbury-room"),
  targetKey("replacement-spice-street-restaurant-silver-spring-md", "spice-street-plain-rice"),
  // Round 28 manual review: adjacent menu rows, portion metadata, ordering
  // prompts, and wrong-location matches are not item descriptions.
  targetKey("stoneys-dc", "roasted-tomato-basil"),
  targetKey("stoneys-dc", "stoneys-cobb"),
  targetKey("la-grande-boucherie-dc-washington-dc-dc-metro", "oysters-dollar3pc"),
  targetKey("chain-matchbox", "soup-of-the-day"),
  targetKey("carusos-grocery-pike-and-rose-md", "burger-deluxe"),
  targetKey("carusos-grocery-pike-and-rose-md", "chefs-salad"),
  targetKey("replacement-limani-washington-dc", "limani-wharf-feta-wrapped-phyllo"),
  targetKey("replacement-limani-washington-dc", "limani-wharf-lamb-chops"),
  targetKey("replacement-marley-s-bar-and-grill-hyattsville-md", "marleys-kids-brunch"),
  // Round 29 manual review: these are a section label, category record,
  // option-only fragments, or a demonstrably shifted neighboring pizza row.
  targetKey("osm-asia-garden-11366360044", "often-liked"),
  targetKey("osm-ted-s-montana-2414839960", "cheeseburger"),
  targetKey("osm-ted-s-montana-2414839960", "karens-flying-d-bison-chili"),
  targetKey("osm-ted-s-montana-2414839960", "kids"),
  targetKey("osm-ted-s-montana-2414839960", "sirloin-steak"),
  targetKey("osm-blue-ocean-japanese-6281378373", "udon-or-soba-hot-or-cold"),
  targetKey("replacement-roscoe-s-pizzeria-takoma-park-md", "vegan-sausage-rapini-vegan-mozzarella"),
  // Round 30 manual review: origin/volume metadata, shifted sibling rows,
  // truncated PDF text, and customization-only fragments are not descriptions.
  targetKey("osm-hama-sushi-5166509330", "veggie-91"),
  targetKey("osm-hama-sushi-5166509330", "dak-galbi-spicy-chicken-grilled-spicy-marinated-chicken-w-onion-and-green-onion-25"),
  targetKey("osm-hama-sushi-5166509330", "house-salad-mixed-green-with-house-ginger-dressing-32"),
  targetKey("sushi-ogawa-dc", "amburjackkona-kanpachi-from-hawaii"),
  targetKey("sushi-ogawa-dc", "bluenose-medai"),
  targetKey("sushi-ogawa-dc", "conger-eel-anago"),
  targetKey("sushi-ogawa-dc", "fluke-hirame"),
  targetKey("sushi-ogawa-dc", "golden-eye-snapper-kinmedai"),
  targetKey("sushi-ogawa-dc", "half-beak-sayori"),
  targetKey("sushi-ogawa-dc", "hotate-scallop"),
  targetKey("sushi-ogawa-dc", "izumibashi-megumi-blue"),
  targetKey("sushi-ogawa-dc", "japanese-mackerel-saba"),
  targetKey("sushi-ogawa-dc", "mantis-shrimp-shako"),
  targetKey("sushi-ogawa-dc", "rockfish-kasago"),
  targetKey("sushi-ogawa-dc", "sea-urchin-hokkaido-uni"),
  targetKey("sushi-ogawa-dc", "stripe-jack-shimaaji"),
  targetKey("sushi-ogawa-dc", "surf-clam-aoyagi"),
  targetKey("j-hollingers-watermans-chophouse-silver-spring-md", "make-it-a-meal"),
  targetKey("j-hollingers-watermans-chophouse-silver-spring-md", "watermans-tower"),
  targetKey("georges-steak-n-things-fairfax-station-va", "two-pieces-of-fish-filet-with-fries-and-tarter-sauceextra-fish-filet"),
  targetKey("replacement-ruan-thai-restaurant-wheaton-md", "duck"),
  targetKey("replacement-sfizi-cafe-falls-church-va", "arugula-with-shaved-parmigiano-reggiano-and-cherry-tomatoes"),
  targetKey("ser-restaurant-arlington-va", "conference-room"),
  // Round 31 manual review: navigation copy, clipped PDF/API rows, merged
  // neighboring menu items, merchandise copy, and size-only metadata are not
  // safe menu-item descriptions. Reviewed replacements are declared below
  // where the official source exposes a complete item-bounded value.
  targetKey("alatri-bros-bethesda-md", "good-were-here-to-serve-you"),
  targetKey("osm-greek-unique-12234989460", "light-and-crispy-tortilla-salad-bowl"),
  targetKey("ramen-menri-bethesda-dc-metro", "bok-choy-2-pc"),
  targetKey("ramen-menri-bethesda-dc-metro", "menri-shiny-sticker"),
  targetKey("replacement-ocha-thai-kitchen-and-cafe-centreville-va", "gingerale"),
  targetKey("replacement-provost-restaurant-washington-dc", "coffee-and-assorted-teas"),
  targetKey("replacement-provost-restaurant-washington-dc", "jerk-salmon-pasta-spicy"),
  targetKey("replacement-provost-restaurant-washington-dc", "lobster-pasta"),
  // Round 32: section labels and quantity-only bread metadata extracted from
  // the Masala Art page are not descriptions.
  targetKey("replacement-masala-art-washington-dc", "bhel-puri"),
  targetKey("replacement-masala-art-washington-dc", "butter-nan"),
  targetKey("replacement-masala-art-washington-dc", "cheese-kulcha"),
  targetKey("replacement-masala-art-washington-dc", "garlic-naan"),
  targetKey("replacement-masala-art-washington-dc", "missi-roti-gf"),
  targetKey("replacement-masala-art-washington-dc", "naan"),
  targetKey("replacement-masala-art-washington-dc", "onion-kulcha"),
  targetKey("replacement-masala-art-washington-dc", "rock-salt-nan"),
  targetKey("replacement-masala-art-washington-dc", "vada-pao-df"),
  targetKey("replacement-masala-art-washington-dc", "whole-wheat-parantha"),
  targetKey("replacement-masala-art-washington-dc", "whole-wheat-roti"),
  // Round 33: these rows are demonstrably adjacent-item PDF/card matches.
  targetKey("floreria-atlantico-dc", "fish-and-chips"),
  targetKey("replacement-pastry-xpo-cafe-falls-church-va", "ham-and-cheese-croissant"),
  targetKey("replacement-pastry-xpo-cafe-falls-church-va", "individual-pastries"),
  targetKey("replacement-tap99-washington-dc", "mozzarella-panko-bread-crumbs-marinara-basil-oil-balsamic-reduction"),
  targetKey("replacement-tap99-washington-dc", "romaine-lettuce-shaved-parmesan-herbed-crutons-house-made-caesar-dressing"),
]);

const round53ReviewedDescriptionCandidates = [
  ["replacement-villa-yara-washington-dc", "hummus", "Hummus", "Chickpeas, tahini, and lemon.", "https://villayaradc.com/wp-content/uploads/2026/06/VY-lunch-Menu-002.pdf"],
  ["replacement-villa-yara-washington-dc", "lamb-chops", "Lamb Chops", "Grilled medium.", "https://villayaradc.com/wp-content/uploads/2026/06/VY-lunch-Menu-002.pdf"],
];

const round52ReviewedDescriptionCandidates = [
  ["brasero-atlantico-dc", "tortilla-and-gambas", "Tortilla & Gambas", "Potato tortilla with garlic prawns.", "https://d444ad25-f629-4bd4-b5d2-eb15ea61b319.filesusr.com/ugd/419eac_eedfd29fd4414f4aa174d4ed05fe2955.pdf"],
];

const round50ReviewedDescriptionCandidates = [
  ["the-dabney-dc", "fireside-farms-breakfast-radish", "FIRESIDE FARMS BREAKFAST RADISH", "Served with spring ranch and kimchi.", "https://www.thedabney.com/menus/"],
  ["the-dabney-dc", "first-of-the-season-breakfast-radish", "FIRST OF THE SEASON BREAKFAST RADISH", "Served with spring ranch and kimchi.", "https://www.thedabney.com/menus/"],
  ["the-capital-burger-washington-dc-dc-metro", "seared-salmon-salad", "Seared Salmon Salad", "Kale, Napa cabbage, pineapple, almonds, carrots, mint, cilantro, and peanut vinaigrette.", "https://www.thecapitalburger.com/menu/"],
  ["the-capital-burger-washington-dc-dc-metro", "southern-style-fried-chicken-sliders", "Southern-Style Fried Chicken Sliders", "Served with spicy honey.", "https://www.thecapitalburger.com/menu/"],
];

const round49ReviewedDescriptionCandidates = [
  ["jimmys-old-town-tavern-herndon-va-dc-metro", "all-american-burger", "All American Burger", "An eight-ounce lean Angus burger served on a Kaiser roll with lettuce, tomato, and onion.", "https://www.jottnew.com/uploads/4/9/1/4/49145785/february-2026-menu-complete.pdf"],
  ["jimmys-old-town-tavern-herndon-va-dc-metro", "jimmys-old-town-tavern-burger", "Jimmy's Old Town Tavern Burger", "An eight-ounce lean Angus burger on a Kaiser roll with barbecue sauce, cheddar cheese, bacon, and a fried onion ring.", "https://www.jottnew.com/uploads/4/9/1/4/49145785/february-2026-menu-complete.pdf"],
  ["replacement-honor-brewing-kitchen-fairfax-fairfax-va", "firecracker-shrimp", "FIRECRACKER SHRIMP", "Tempura shrimp with sweet-chili sriracha and sweet soy-ginger sauce, topped with green onions, chili threads, and cilantro.", "https://honorbrewing.com/s/Updated-Fairfax-Menu.pdf"],
];

const round48ReviewedDescriptionCandidates = [
  ["dyfres-burger-springfield-dc-metro", "dyfres-double-trouble", "DYFRE’S DOUBLE TROUBLE", "Grilled charcoal bun, two beef patties, mozzarella cheese, bacon, tomato, sautéed onions, and signature homemade sauce.", "https://dyfresburger.com/product/dyfres-double-trouble/"],
];

const round47ReviewedDescriptionCandidates = [
  ["sushi-taro-dc", "habanero-scallop-roll", "HABANERO SCALLOP ROLL", "Salmon, dried tomato, and mixed chili pepper.", "https://order.toasttab.com/online/sushi-taro-1503-17th-st-nw"],
  ["sushi-taro-dc", "shrimp-tempura-roll", "SHRIMP TEMPURA ROLL", "Lettuce and mayonnaise with shrimp tempura.", "https://order.toasttab.com/online/sushi-taro-1503-17th-st-nw"],
  ["st-anselm-dc", "flatiron-steak", "Flatiron Steak", "Served with chermoula.", "https://www.stanselm.net/dinner"],
  ["st-anselm-dc", "pan-fried-mashed-potatoes", "Pan-Fried Mashed Potatoes", "Prepared with lard.", "https://www.stanselm.net/dinner"],
  ...[
    ["chicky-bun", "CHICKY BUN", "Marinated and grilled tandoori chicken, Lucky sauce, Gouda, arugula, charred red onion, and Gordy’s pickles."],
    ["chopped-cheese", "CHOPPED CHEESE", "Chopped Angus beef with bodega spice, provolone, American cheese, caramelized onions, lettuce, tomato, and pickled-chili garlic mayonnaise on a sesame grinder roll."],
    ["club-sando", "CLUB SANDO", "Roasted turkey, crispy bacon, provolone, tomato, arugula and chicory, and pickled-chili garlic mayonnaise on buttered Japanese milk bread."],
    ["crunchy-bun", "CRUNCHY BUN", "Lentil-mushroom veggie patty, Gouda, Lucky sauce, arugula, grilled red onion, and pickles."],
    ["el-jefe-bun", "EL JEFE BUN", "Double aged-Angus beef patties, American cheese, Hatch green-chili relish, cotija crema, yellow mustard, shredded lettuce, red onion, and Gordy’s pickles."],
    ["hot-chicken", "HOT CHICKEN", "Crispy fried chicken thigh, spicy Sichuan-habanero chili spice mop, milk bread, crunchy slaw, fries, buttermilk ranch, and pickles."],
    ["patty-melt", "PATTY MELT", "Double patties, American cheese, griddled onions, pickles, Lucky sauce, and butter-toasted Japanese milk bread."],
  ].map(([itemId, itemName, description]) => ["lucky-buns-dc", itemId, itemName, description, "https://media-cdn.getbento.com/accounts/94d7c0eebe8c5743d369e32524589f82/media/9Zp69Rl7SI2tUkbKIJgq_ADMO%20DINNER%20MENU%20NEW%20%281%29.pdf"]),
  ["mi-la-cay-wheaton-md-dc-metro", "mi-la-cay-crispysoft-egg-noodles-with-seafood", "Crispy/Soft Egg Noodles with Seafood", "Crispy or soft egg noodles with shrimp, squid, fish balls, mussels, crab meat, and mixed vegetables, topped with fried onion.", "http://milacaywheaton.com/assets/imgs/menu.pdf"],
  ["ristorante-bonaroti-vienna-va", "calamari-fritti", "Calamari Fritti", "Prepared as fried squid.", "https://bonarotirestaurant.com/lunch.php"],
  ["replacement-planta-washington-dc-washington-dc", "firecracker", "FIRECRACKER", "Sweet potato, avocado, potato straws, unagi, gochujang mayonnaise, and chili salt.", "https://www.plantarestaurants.com/washington-dc-location/"],
  ["replacement-planta-washington-dc-washington-dc", "truffle-fries", "TRUFFLE FRIES", "Nutritional yeast and chives.", "https://www.plantarestaurants.com/washington-dc-location/"],
  ["puttery-washington-dc-dc-metro", "creamy-cajun-alfredo", "CREAMY CAJUN ALFREDO", "Choice of chicken or shrimp with penne, Cajun Alfredo, Manchego, black pepper, and ciabatta bread.", "https://www.puttery.com/locations/washington-dc/menu/"],
  ["puttery-washington-dc-dc-metro", "elote-style-corn-ribs", "ELOTE STYLE CORN RIBS", "Corn ribs, Tajín, cotija, cilantro, lime-ancho crema, and lime.", "https://www.puttery.com/locations/washington-dc/menu/"],
  ["puttery-washington-dc-dc-metro", "green-goddess-cobb", "GREEN GODDESS COBB", "Chicken, bacon, avocado, tomato, hard-boiled egg, blue cheese, and Green Goddess dressing.", "https://www.puttery.com/locations/washington-dc/menu/"],
  ["puttery-washington-dc-dc-metro", "korean-power-bowl", "KOREAN POWER BOWL", "Marinated Korean beef, ginger rice, marinated cucumbers, sesame, green onions, gochujang chili aioli, chili oil, sunny-side egg, kimchi, and carrots.", "https://www.puttery.com/locations/washington-dc/menu/"],
  ["puttery-washington-dc-dc-metro", "shishito-peppers", "SHISHITO PEPPERS", "Blistered shishitos, crispy garlic, garlic aioli, soy glaze, chili oil, lemon, and sesame seeds.", "https://www.puttery.com/wp-content/uploads/2026/03/260325_Puttery_DC_Core_Menu.pdf"],
];

const round46ReviewedDescriptionCandidates = [
  ["dauphines-dc", "golden-marble-potatoes", "Golden Marble Potatoes", "Served with chimichurri.", "https://www.dauphinesdc.com/menu/dinner/"],
  ["dolan-uyghur-dc", "royal-laghman", "Royal Laghman", "Beef, stir-fried onions, cabbage, mushrooms, green and red peppers, oyster-flavored sauce, and tomato over hand-pulled chewy noodles.", "https://www.dolanuyghur.com/dc/digital-menu"],
  ...[
    ["bicky-burger", "Bicky burger", "Ground beef and pork, nutmeg, Bicky sauce, fried onions, pickles, a toasted English muffin, and fries."],
    ["croque-madame", "CROQUE MADAME", "Pain grand-père, ham, Gruyère, sunny egg, Mornay, and frites."],
    ["meatballs", "MEATBALLS", "Served with witbier mustard cream."],
    ["saffron-mussels", "SAFFRON MUSSELS", "Fennel, smoked sausage, red pepper, tomato, roasted garlic, and frites."],
    ["speck", "SPECK", "Gruyère cream, Gruyère, Parmesan, caramelized onions, shaved speck, and watercress."],
    ["wild-mushroom-risotto", "Wild Mushroom Risotto", "Carnaroli rice, turnips, asparagus, scallions, mushrooms, and lemon gremolata."],
    ["beet-salad", "Beet Salad", "Roasted beets, orange, arugula, frisée, thyme crème fraîche, hazelnuts, and citrus vinaigrette."],
    ["belgian-endive-salad", "Belgian Endive Salad", "Baby gem lettuce, Fourme d’Ambert, cranberries, green apple, radish, and kriek vinaigrette."],
    ["shaved-brussels-sprouts", "SHAVED BRUSSELS SPROUTS", "Brussels sprouts, radicchio, feta, apple, walnuts, and Madras curry vinaigrette."],
    ["spinach-salad", "Spinach Salad", "Spinach, pears, pistachios, pickled red onion, radish, goat cheese, and balsamic vinaigrette."],
    ["duck-confit", "Duck Confit", "Crispy duck leg, herbed spaetzle, spinach, shiitake mushrooms, leeks, and beer reduction."],
    ["pomme-puree", "POMME PUREE", "Made with butter and Parmesan."],
    ["roasted-carrots", "Roasted Carrots", "Served with lemon gremolata."],
  ].map(([itemId, itemName, description]) => ["the-sovereign-washington-dc-dc-metro", itemId, itemName, description, "https://566887a5-7e39-4167-ba35-f1efc3c0854c.filesusr.com/ugd/422236_9bbb6711a6764a71a966ad36d74ce968.pdf"]),
  ["osm-ela-mesa-taste-of-greece-12162675751", "chicken-skewer-pita", "Chicken Skewer Pita", "Chicken skewer wrapped in pita bread with tomatoes, onions, lettuce, feta, and tzatziki sauce, served with fries.", "https://elamesatasteofgreece.com/menu/"],
  ["osm-ela-mesa-taste-of-greece-12162675751", "grilled-veggies", "Grilled Veggies", "Marinated seasonal vegetables and herbs.", "https://elamesatasteofgreece.com/menu/"],
  ["replacement-pearl-dive-oyster-palace-washington-dc", "dive-burger", "Dive Burger", "Roasted green chiles, pepper jack cheese, bacon, lettuce, tomato, onion, and cayenne aioli.", "https://pearldivedc.com/wp-content/uploads/2026/04/02-Dinpg2.3.16.pdf"],
  ["replacement-pearl-dive-oyster-palace-washington-dc", "smoked-andouille-sausage", "Smoked Andouille Sausage", "Holy trinity, bacon, tasso ham, filé, okra, and house spices, served with buttered rice and garlic bread.", "https://pearldivedc.com/wp-content/uploads/2026/04/02-Dinpg2.3.16.pdf"],
  ["pearl-dive-oyster-palace-dc", "bar-harbor-mussels-half-pound-pound", "Bar Harbor Mussels Half Pound / Pound", "Choice of Addies style with garlic, shallot, tomato, chicken stock, butter, lemon, chili flake, and grilled baguette, or A la Gato style with saffron cream, gumbo stock, tomato, chili flake, and grilled baguette.", "https://pearldivedc.com/wp-content/uploads/2026/04/02-Dinpg2.3.16.pdf"],
  ["pearl-dive-oyster-palace-dc", "smoked-andouille-sausage", "Smoked Andouille Sausage", "Holy trinity, bacon, tasso ham, filé, okra, and house spices, served with buttered rice and garlic bread.", "https://pearldivedc.com/wp-content/uploads/2026/04/02-Dinpg2.3.16.pdf"],
  ["cordelia-fishbar-dc", "whole-grilled-branzino", "Whole Grilled Branzino", "Stewed Sungold tomatoes, gigante beans, kale, citrus pesto, and pine nuts.", "https://images.getbento.com/accounts/ea51096e20193e1b20288addb6fc7c1c/media/Yboeo3dSDmVphq5bXJGQ_CFB_RW_Summer26.pdf"],
  ["shia-dc", "ssam", "Ssam", "Scallop and fried oyster ssam with myeongran, Korean pear, and ssamjang.", "https://shiarestaurant.org/old-page1564878-menu/"],
  ["shia-dc", "ipgasim", "Ipgasim", "Sujeonggwa sorbet with nut gangjeong.", "https://shiarestaurant.org/old-page1564878-menu/"],
];

const round45ReviewedDescriptionCandidates = [
  ["elcielo-dc", "tuna-tartare", "Tuna Tartare", "Chicharrón, corn, and peanuts.", "https://elcielo.com.co/washington/elbistro-menu/our-crudos/"],
  ["elcielo-dc", "confit-mushrooms", "Confit Mushrooms", "Seasonal mushrooms and sunchokes.", "https://elcielo.com.co/washington/elbistro-menu/sides/"],
  ["elcielo-dc", "asparragus", "Asparragus", "Ramps and purslane.", "https://elcielo.com.co/washington/elbistro-menu/sides/"],
  ["elcielo-dc", "flan", "Flan", "Vanilla and salted caramel.", "https://elcielo.com.co/washington/elbistro-menu/desserts/"],
  ["mezcalero-dc", "camarones", "Camarones", "Made with shrimp.", "https://www.mezcalero14th.com/lunch-dinner"],
  ["mezcalero-dc", "mushroom", "Mushroom", "Wild mushroom.", "https://www.mezcalero14th.com/lunch-dinner"],
  ["carbonara-arlington-va-dc-metro", "the-sinatra", "THE SINATRA", "Breaded chicken cutlet, prosciutto, mozzarella, tomato, roasted peppers, and basil, topped with balsamic glaze on hero bread.", "https://carbonarava.com/"],
  ["carbonara-arlington-va-dc-metro", "milano-special", "MILANO SPECIAL", "Prosciutto, salami, capicola, mortadella, provolone, lettuce, tomato, and roasted peppers with oil and vinegar on hero bread.", "https://carbonarava.com/"],
  ...[
    ["circa-at-foggy-bottom-washington-dc-dc-metro", "circa-foggy-bottom-thaishrimp", "Thai Shrimp"],
    ["osm-circa-2788369922", "thai-shrimp", "Thai Shrimp"],
  ].map(([restaurantId, itemId, itemName]) => [restaurantId, itemId, itemName, "Shotgun shrimp, mixed greens, napa cabbage, carrots, cucumber, red onion, marinated tomatoes, crispy wontons, micro cilantro, peanuts, and Thai peanut vinaigrette.", "https://www.circabistros.com/location/clarendon/"]),
  ["osm-hi-fi-tex-mex-bbq-12965590481", "taco-night-in-america", "TACO NIGHT IN AMERICA", "Smoked beef, iceberg lettuce, queso, pico, smoked crema, and a crunchy shell.", "https://www.hifitexmexbbq.com/_files/ugd/ea7e5d_ef3a29bdf10943b7811e115482016e17.pdf"],
  ["osm-hamrock-s-resturaunt-379238772", "monterey-fried-chicken-salad", "Monterey FRIED CHICKEN SALAD", "Chopped romaine, corn, tomatoes, cucumbers, candied pecans, sun-dried cranberries, honey mustard, mandarin oranges, and cheddar-jack cheese.", "https://hamrocksrestaurant.com/wp-content/uploads/2026/06/Ten-Year-Menu-PDF.pdf"],
];

const round44ReviewedDescriptionCandidates = [
  ["martins-tavern-dc", "ty-cobb-salad", "TY COBB SALAD", "Grilled chicken, fresh tomatoes, avocado, hard-boiled egg, Applewood-smoked bacon, and crumbled blue cheese over mixed greens, topped with fried shallots and served with ranch dressing.", "https://www.martinstavern.com/menus/"],
  ["osm-10-pizza-2622784870", "wings", "WINGS", "Eight jumbo wings.", "https://order.toasttab.com/online/10pizza"],
];

const round43ReviewedDescriptionCandidates = [
  ["california-pizza-kitchen", "california-veggie", "California Veggie", "Broccolini, grilled zucchini, shaved cremini mushrooms, roasted cherry tomatoes, corn, red onions, and mozzarella; also available with goat cheese.", "https://www.cpk.com/menu/"],
  ["osm-black-hog-8285173071", "the-underbelly", "The Underbelly", "Pork belly smoked like brisket.", "https://blackhogbbq.com/wp-content/uploads/2026/05/BHB_PaperMenu_ALL_033126-1.pdf"],
  ...[
    ["1310-cheeseburger-gfo", "1310 Cheeseburger (gfo)", "Chapel Hill Farm beef, cheddar, bacon-tomato jam, maple aioli, pickled onions, and arugula, with a choice of French fries or mixed greens."],
    ["fresh-seasonal-fruit-vv-gf", "Fresh Seasonal Fruit (vv, gf)", "Strawberries, blueberries, and pineapple."],
    ["greek-salad-and-lentils", "Greek Salad & Lentils", "Tomato, red onion, feta, cucumber, olives, and tzatziki."],
    ["ham-egg-and-cheese-croissant", "Ham, Egg & Cheese Croissant", "Ham, cheddar, and scrambled egg on a croissant."],
    ["huevos-rancheros", "Huevos Rancheros", "Tortilla, refried beans, pico de gallo, jalapeño, queso fresco, avocado, and sunny-side-up egg."],
  ].map(([itemId, itemName, description]) => ["replacement-1310-kitchen-and-bar-washington-dc", itemId, itemName, description, "https://www.1310kitchendc.com/_files/ugd/255e9c_2265187508b941178729ea6dd47831c0.pdf"]),
];

const round42ReviewedDescriptionCandidates = [
  ...[
    ["kyojin-signature-bun", "Kyojin Signature Bun", "A5 wagyu beef, buttered garlic bun, truffle carpaccio, jalapeño, black pepper sauce, and balsamic reduction."],
    ["surf-and-turf", "Surf And Turf", "Lobster wrapped with A5 wagyu, scallions, caviar, black truffle, butter black pepper sauce, garlic ponzu, and balsamic reduction."],
    ["the-monster-quad", "The Monster Quad", "Seared A5 wagyu with Hokkaido uni; toro with uni; seared butter-miso scallop with uni; and seared salmon belly with butter miso, lavender-smoked salmon roe, French caviar, truffle wasabi, Japanese chili, and shoyu."],
    ["toro-tartare", "Toro Tartare", "Fatty bluefin tuna, French caviar, 24K gold, chili yuzu, garlic ponzu, and wasabi nori chips."],
    ["toro-tower", "Toro Tower", "Monkfish liver, fatty bluefin tuna, Hokkaido uni, Hokkaido scallop, ikura, French caviar, garlic ponzu, chili yuzu, and yuzu ice."],
    ["uni-pasta", "Uni Pasta", "Garlic butter miso, pasta, Hokkaido uni, ikura, balsamic pearls, French caviar, carpaccio sauce, and ichimi."],
    ["seared-a5-wagyu-with-smoked-ikura", "Seared A5 Wagyu With Smoked Ikura", "Seared A5 wagyu, lavender-smoked ikura, balsamic pearl, wasabi truffle with shoyu, red sea salt, and 24K gold."],
    ["a5-wagyu-roll", "A5 Wagyu Roll", "Lump crab, avocado, cucumber, spicy mayo, A5 wagyu, truffle oil, black pepper sauce, truffle wasabi, French caviar, and balsamic reduction."],
    ["mexican-roll", "Mexican Roll", "Shrimp tempura roll, tomato salsa, cucumber, jalapeño, and tempura bits, topped with avocado and served with eel sauce, spicy mayo, creamy jalapeño sauce, garlic ponzu, and sweet chili sauce."],
    ["miyabi-roll", "Miyabi Roll", "Lobster tempura, pickled cucumber, eel sauce, and creamy mustard, topped with barbecue eel, balsamic reduction, caviar, black pepper sauce, truffle oil, and truffle wasabi."],
    ["scallop-sunlight-roll", "Scallop Sunlight Roll", "Spicy tuna, avocado, tempura bits, Hokkaido scallop, kiwi, and mango tobiko sauce."],
    ["supreme-lobster-roll", "Supreme Lobster Roll", "Lobster tempura, watermelon daikon, eel sauce, creamy mustard, A5 seared garlic-miso butter, black pepper sauce, truffle oil, balsamic reduction, caviar, truffle wasabi, black bamboo sea salt, pepper powder, and pink sauce on the side."],
  ].map(([itemId, itemName, description]) => ["kyojin-dc", itemId, itemName, description, "https://media-cdn.getbento.com/accounts/b58c861f9f6bde379f737d89f20ed52f/media/ZKRtUG6hSqCa4M1b17Tl_KYOJIN%20Menu%20.pdf"]),
  ...[
    ["aaloo-prantha", "AALOO PRANTHA", "Potato-stuffed bread."],
    ["chana-masala-chickpeas-vegan", "CHANA MASALA CHICKPEAS (VEGAN)", "Side of chickpeas."],
    ["daal-tadka-yellow-lentils-vegan", "DAAL TADKA YELLOW LENTILS (VEGAN)", "Side of yellow lentils."],
    ["gobhi-aaloo-vegan", "GOBHI AALOO (VEGAN)", "Cauliflower florets with potatoes."],
    ["gobhi-prantha", "GOBHI PRANTHA", "Bread stuffed with grated cauliflower."],
    ["plain-roti", "PLAIN ROTI", "Whole-wheat flatbread."],
    ["veggie-samosa", "VEGGIE SAMOSA", "Stuffed with peas and potatoes."],
  ].map(([itemId, itemName, description]) => ["indigo-dc", itemId, itemName, description, "https://www.indigowdc.com/app/store/api/v28/editor/users/125135581/sites/535579149465386276/products?page=1&per_page=200&include=images,media_files,discounts"]),
  ...[
    ["belgian-waffle-station", "BELGIAN WAFFLE STATION", "Fresh strawberries, salted caramel, fruit compote, whipped cream, chocolate sauce, and maple syrup."],
    ["boatmans-platter", "BOATMAN'S PLATTER", "Six oysters, six chilled jumbo shrimp, lobster tail, ceviche, horseradish crème, smoked cocktail sauce, mignonette, and lemon."],
    ["buttermilk-fried-oysters", "BUTTERMILK FRIED OYSTERS", "Served with tartar sauce and pickles."],
    ["ceviche", "CEVICHE", "Served with guacamole and plantain chips."],
    ["chophouse-burger", "CHOPHOUSE BURGER", "Black Angus beef burger with lettuce, tomato, onion, house pickles, chophouse sauce, and house-cut fries on a brioche bun."],
    ["hollingers-watermans-stew", "HOLLINGER'S WATERMAN'S STEW", "Fish, clams, shrimp, mussels, calamari, potatoes, and spinach in a red fisherman's broth, served with crostini."],
    ["steak-satay", "STEAK SATAY", "Served with chimichurri sauce."],
  ].map(([itemId, itemName, description]) => ["replacement-j-hollinger-s-waterman-s-chophouse-silver-spring-md", itemId, itemName, description, "https://www.jhollingers.com/wp-content/uploads/JHollingersDinnerMenu-June26-2.pdf"]),
  ["osm-la-brasita-10119939334", "fish-ceviche", "Fish Ceviche", "Mahi mahi, lime, onion, cilantro, camote, and tortilla chips.", "https://order.yourmenu.com/labrasita"],
  ["osm-la-brasita-10119939334", "fajita-salmon-y-camaron", "Fajita Salmon Y Camaron", "Grilled salmon and shrimp served on a bed of vegetables with yellow rice, red beans, sour cream, pico de gallo, guacamole, and flour tortillas.", "https://order.yourmenu.com/labrasita"],
  ["replacement-pennyroyal-station-mt-rainier-md", "pennyroyal-salad", "PENNYROYAL SALAD", "Mixed greens, baby beets, heirloom carrots, spiced almonds, lemon ricotta, and turmeric-honey dressing.", "https://www.pennyroyalstation.com/s/PennysDinnerMenu.pdf"],
  ["replacement-cynthia-bar-and-bistro-washington-dc", "brunch-smashburger", "BRUNCH SMASHBURGER", "Fried egg, cheddar, lettuce, tomato, onion, pickles, and Cynthia sauce, served with home fries or fruit.", "https://www.cynthiadc.com/s/SUMMER-BRUNCH-MENU-2.pdf"],
  ...[
    ["hangover-lo-mein-s", "HANGOVER LO MEIN (S)", "Sautéed lo mein with chicken, onions, carrots, cherry tomatoes, finger peppers, and bell peppers in a spicy basil and Sriracha sauce."],
    ["jungle-lover-s", "JUNGLE LOVER (S)", "Sautéed red curry paste with coconut milk, bamboo shoots, eggplant, green beans, young peppercorns, bell peppers, and basil."],
    ["roti-massaman-curry-s", "ROTI MASSAMAN CURRY (S)", "Sautéed Massaman curry paste with coconut milk, carrots, onions, potatoes, peanuts, and fried shallots, served with roti."],
  ].map(([itemId, itemName, description]) => ["osm-dok-khao-10728675757", itemId, itemName, description, "https://dokkhao.com/dok-khao-woodbridge-menu/"]),
  ...[
    ["cf09-mote-nyinchin-htamin-gyaw", "CF09. Mote Nyinchin Htamin Gyaw", "Sour mustard stir-fried with jasmine rice and a choice of tofu, chicken, pork, beef, pork belly, shrimp, or egg."],
    ["s04-theesone-hin", "S04. Theesone Hin", "Vegetable soup with string beans, okra, eggplant, potato, carrots, and yellow split peas."],
    ["s05-theesone-hin-kyet", "S05. Theesone Hin Kyet", "Vegetable soup with string beans, okra, eggplant, potato, carrot, yellow split peas, and dark-meat chicken strips."],
    ["v15-htamin-paung", "V15. Htamin Paung", "Lightly fried tofu or dry bean curd with broccoli, cauliflower, cabbage, and carrots in thick brown sauce over rice."],
  ].map(([itemId, itemName, description]) => ["mandalay-silver-spring-md", itemId, itemName, description, "https://www.mandalayrestaurantcafe.com/_files/ugd/f1bafc_4ed33c5afd5a4acab246869c0185ec09.pdf"]),
  ["tatte-dc", "pistachio-rose-cold-foam-latte", "Pistachio Rose Cold Foam Latte", "Housemade pistachio syrup mixed with espresso and milk, topped with pistachio-milk rose cold foam and dusted with pistachios.", "https://tattebakery.com/menu/247374"],
  ...[
    ["corn-and-spinach-shakshuka", "Corn & Spinach Shakshuka", "Poached eggs in a creamy corn sauce with baby spinach and zucchini, topped with heirloom cherry tomatoes, feta, zhoug, Aleppo chili oil, and parsley; served with housemade sourdough."],
    ["grab-and-go-overnight-oats-with-roasted-peach-and-raspberry", "Grab & Go Overnight Oats with Roasted Peach and Raspberry", "Overnight oats with roasted peaches, fresh raspberries, apricot jam, toasted pistachios, and honey."],
    ["overnight-oats-with-roasted-peach-and-raspberry", "Overnight Oats with Roasted Peach and Raspberry", "Overnight oats with roasted peaches, fresh raspberries, apricot jam, toasted pistachios, and honey."],
    ["strawberry-roasted-peach-and-chicken-salad", "Strawberry, Roasted Peach & Chicken Salad", "Mixed lettuces, baby spinach, fresh strawberries, roasted peaches, red onion, roasted chicken, toasted cashews, goat cheese, and balsamic dressing."],
    ["tahini-caesar-salad", "Tahini Caesar Salad", "Little Gem romaine, za'atar croutons, Tahini Caesar dressing, heirloom cherry tomatoes, sliced radish, shaved Parmesan, fresh mint, sumac, and cracked black pepper."],
  ].map(([itemId, itemName, description]) => ["tatte-dc", itemId, itemName, description, "https://tattebakery.com/menu/247374"]),
];

const round41ReviewedDescriptionCandidates = [
  ...[
    ["brussels-sprouts", "Brussels Sprouts", "Served with Greek yogurt."],
    ["roasted-cauliflower", "Roasted Cauliflower", "Served with spicy dill vinaigrette."],
    ["greek-donuts", "Greek Donuts", "Served with honey and walnuts."],
  ].map(([itemId, itemName, description]) => ["cava-mezze-rockville-dc-metro", itemId, itemName, description, "https://order.toasttab.com/online/cava-mezze-rockville"]),
  ...[
    ["avocado-toast", "AVOCADO TOAST", "Grand rustico bread, poached eggs, black bean salsa, feta, cilantro, and chili oil."],
    ["brunch-burger", "BRUNCH BURGER", "Black Forest ham, pepper Jack, chipotle aioli, fried egg, lettuce, and tomato on a brioche bun, served with hand-cut fries."],
    ["veggie-burger", "Veggie Burger", "House-made patty with sunflower seeds, hummus, cucumber, red onion, pickled beets, and avocado on a brioche bun, served with sweet potato fries."],
  ].map(([itemId, itemName, description]) => ["open-road-falls-church-va-dc-metro", itemId, itemName, description, "https://www.openroadgrill.com/location/merrifield/" ]),
  ["osteria-morini-washington-dc-dc-metro", "morini-burger", "MORINI BURGER", "Dry-aged burger with scamorza, shaved fennel, red onion, Fresno chili aioli, and crispy potatoes.", "https://osteriamorini.com/washington-dc/menus/dinner/"],
  ["osteria-morini-washington-dc-dc-metro", "tagliatelle", "TAGLIATELLE", "Tagliatelle with Bolognese and Parmigiano.", "https://osteriamorini.com/washington-dc/menus/dinner/"],
  ["osteria-morini-washington-dc-dc-metro", "frittata", "FRITTATA", "Market vegetables, pesto, almond, burrata, arugula, and lemon vinaigrette.", "https://osteriamorini.com/washington-dc/menus/brunch/"],
  ["osm-rus-uz-3732378171", "black-caviar-tart", "Black Caviar Tart", "Puff-pastry tarts topped with black caviar.", "https://rusuz.com/menu/"],
  ["osm-rus-uz-3732378171", "vareniki-russian-style-ravioli", "Vareniki – Russian style ravioli", "Boiled ravioli filled with potato and topped with sour cream.", "https://rusuz.com/menu/"],
  ...[
    ["agora-cheeseburger", "AGORA CHEESEBURGER", "Grilled minced lamb and New York strip patties with remoulade, caramelized onions, tomato, pickled cucumber, and lettuce."],
    ["falafel", "FALAFEL +", "Falafel with tahini, mixed greens, and tomatoes."],
    ["gozleme", "GOZLEME", "Stuffed flatbread with spring onion, dill, parsley, feta, olive oil, and Maras pepper."],
    ["greek-yogurt-parfait", "GREEK YOGURT PARFAIT", "Greek yogurt with mixed berries, granola, and honey."],
    ["ottoman-rice", "OTTOMAN RICE", "Rice cooked with black currants, apricots, chicken broth, almonds, pine nuts, and fried shallots."],
    ["vegetable-omelette", "VEGETABLE OMELETTE", "Mushrooms, asparagus, red and green peppers, tomatoes, and onions, served with Agora fries."],
  ].map(([itemId, itemName, description]) => ["agora-tysons-va", itemId, itemName, description, "https://www.agorarestaurants.net/agora-tyson-menus/"]),
  ...[
    ["chopped-cobb", "Chopped Cobb", "Mixed greens, grilled chicken, cheddar Jack, egg, bacon, avocado, tomato, blue cheese crumbles, and cilantro-lime dressing; available as a wrap or salad."],
    ["classic-burger", "Classic Burger", "Chargrilled Angus beef, bacon, lettuce, tomato, pickles, and choice of cheddar, Swiss, or blue cheese on a brioche bun."],
    ["cowboy-burger", "Cowboy Burger", "Comeback sauce, onion ring, bacon, coleslaw, barbecue sauce, and cheddar."],
    ["fried-cod-sandwich", "FRIED COD SANDWICH /", "Beer-battered cod, lettuce, tomato, pickles, and charred-jalapeño tartar sauce on a brioche bun."],
  ].map(([itemId, itemName, description]) => ["velocity-bar-kitchen-fairfax-va", itemId, itemName, description, "https://order.thompsonrestaurants.com/menu/velocity-bar-kitchen-fairfax"]),
  ...[
    ["cf09-mote-nyinchin-htamin-gyaw", "CF09. Mote Nyinchin Htamin Gyaw", "Sour mustard stir-fried with jasmine rice and a choice of tofu, chicken, pork, beef, pork belly, shrimp, or egg."],
    ["s04-theesone-hin", "S04. Theesone Hin", "Vegetable soup with string beans, okra, eggplant, potato, carrots, and yellow split peas."],
    ["s05-theesone-hin-kyet", "S05. Theesone Hin Kyet", "Vegetable soup with string beans, okra, eggplant, potato, carrot, yellow split peas, and dark-meat chicken strips."],
    ["v15-htamin-paung", "V15. Htamin Paung", "Lightly fried tofu or dry bean curd with broccoli, cauliflower, cabbage, and carrots in thick brown sauce over rice."],
  ].map(([itemId, itemName, description]) => ["replacement-mandalay-restaurant-and-cafe-silver-spring-md", itemId, itemName, description, "https://toast.app/r/mandalay-restaurant-cafe/order"]),
  ...[
    ["acai-bowl", "Acai Bowl", "Açaí bowl with kiwi, berries, coconut, almond, chia, and flax seed."],
    ["atlantic-red-snapper", "Atlantic Red Snapper", "Asparagus, arugula, Meyer lemon, and Grenobloise."],
    ["black-angus-filet", "Black Angus Filet", "Château potatoes, chanterelles, and truffle sauce."],
    ["breakfast-power-bowl", "Breakfast Power Bowl", "Chickpeas, lentils, kale, spinach, avocado, sweet potato, and soft-boiled egg."],
    ["brioche-french-toast", "Brioche French Toast", "Rhubarb, strawberries, and toasted almonds."],
    ["chicken-presse", "Chicken Presse", "Jardinière, cucumber, and basil crème fraîche."],
    ["corned-beef-hash", "Corned Beef Hash", "Fresh thyme and poached egg."],
    ["curried-cauliflower", "Curried Cauliflower", "Tomato, fava beans, and English peas."],
    ["green-asparagus-salad", "Green Asparagus Salad", "Farm chèvre, citrus, and crispy quinoa."],
    ["green-asparagus-salad-gf", "Green Asparagus Salad", "Farm chèvre, citrus, and crispy quinoa."],
    ["grilled-branzini", "Grilled Branzini", "Broccolini, harissa, and chermoula."],
    ["mean-green-protein-plant-protein", "Mean Green Protein: Plant Protein", "Kale, spinach, cucumber, banana, oat milk, and turmeric."],
    ["pure-watermelon-recovery", "Pure Watermelon: Recovery", "Watermelon and lemon."],
  ].map(([itemId, itemName, description]) => ["replacement-the-lafayette-washington-dc", itemId, itemName, description, "https://www.hayadams.com/dining/the-lafayette"]),
];

const round40ReviewedDescriptionCandidates = [
  ["chiko-dc", "soy-glazed-brisket", "Soy Glazed Brisket", "2Fifty Texas BBQ brisket, soy-brined soft egg, furikake butter, and rice.", "https://www.mychiko.com/menu"],
  ["agua-301-restaurant-washington-dc-dc-metro", "black-bean-cheese-dip", "Black Bean Cheese Dip", "Black beans, Chihuahua cheese, onions, bell peppers, and jalapeño, served with flour tortillas.", "https://agua301.com/washington-yards-park-agua-301-food-menu"],
  ...[
    ["ahi-tuna-salad", "AHI TUNA SALAD", "Arugula, seared ahi tuna, guacamole, cucumber, pickled red onion, and cherry tomato."],
    ["arugula-salad", "ARUGULA SALAD", "Blackened chicken breast, arugula, orange, strawberries, blueberries, pickled red onion, cherry tomato, and champagne vinaigrette."],
    ["breakfast-burrito", "BREAKFAST BURRITO", "Scrambled eggs, home fries, onions, peppers, tomatoes, bacon, sausage, and mixed cheese in a flour-tortilla wrap, served with salsa."],
    ["breakfast-skillet", "BREAKFAST SKILLET", "Diced bacon, onions, peppers, mushrooms, potatoes, country sausage, and cheddar, topped with two eggs and served with toast."],
    ["buffalo-chicken-salad", "BUFFALO CHICKEN SALAD", "House-made buffalo tenders, mixed greens, blue cheese crumbles, pickled red onion, cherry tomato, and buffalo-ranch dressing."],
    ["cheese-omelet", "CHEESE OMELET", "Choice of three add-ins—spinach, bacon, tomatoes, ham, onions, green peppers, or olives—served with home fries and toast."],
    ["chili-nachos", "CHILI NACHOS", "Ground beef, black beans, cheddar, pico de gallo, sour cream, and guacamole."],
    ["cork-cobb-salad", "CORK COBB SALAD", "Grilled chicken breast, mixed greens, diced bacon, tomato, egg, and blue cheese crumbles."],
    ["crispy-chicken-sandwich", "CRISPY CHICKEN SANDWICH", "Buttermilk-marinated chicken breast, smoked bacon, Swiss cheese, lettuce, tomato, and buffalo-ranch dressing, served with steak fries."],
    ["fried-pickle-spears", "FRIED PICKLE SPEARS", "Served with spicy aioli."],
    ["irish-eggs-benedict", "IRISH EGGS BENEDICT", "Poached eggs, Irish bacon, English muffins, and hollandaise, served with home fries and toast."],
    ["kinsale-seafood-stew", "KINSALE SEAFOOD STEW", "Shrimp, salmon, mussels, fresh fish, herbs, potatoes, and leeks in a light clam cream sauce, served with house-made garlic bread."],
    ["mediterranean-omelet", "MEDITERRANEAN OMELET", "Spinach, tomatoes, olives, and feta, served with home fries and toast."],
    ["roast-beef-sandwich", "ROAST BEEF SANDWICH", "Sliced roast beef, au jus, sautéed onions and mushrooms, provolone, lettuce, tomato, and horseradish, served with steak fries."],
    ["shepherds-pie", "SHEPHERD’S PIE", "Ground beef, peas, carrots, celery, onions, and mashed potatoes."],
    ["shrimp-salad", "SHRIMP SALAD", "Chilled shrimp, mixed greens, watermelon, feta, orange, cranberries, pickled red onion, and champagne vinaigrette."],
    ["smoked-salmon-benedict", "SMOKED SALMON BENEDICT", "Poached eggs, smoked salmon, English muffins, and hollandaise, served with home fries and toast."],
    ["steak-salad", "STEAK SALAD", "Grilled marinated flank steak, mixed greens, egg, red onion, tomato, and blue cheese crumbles."],
    ["vegetarian-platter", "VEGETARIAN PLATTER", "Sautéed mushrooms, spinach, Brussels sprouts, carrots, broccoli, cherry tomato, and black beans with rice."],
    ["vegetarian-quesadilla", "VEGETARIAN QUESADILLA", "Cheddar, mushrooms, spinach, tomato, and onion, served with pico de gallo, guacamole, and sour cream."],
  ].map(([itemId, itemName, description]) => ["ireland-s-four-provinces-falls-church-va-dc-metro", itemId, itemName, description, "http://www.4psva.com/dinein-amp-carryout-menu"]),
  ...[
    ["aloo-bonda-dinner-only", "ALOO BONDA (Dinner Only)", "Seasoned potato dumpling coated with besan flour and deep-fried."],
    ["aloo-matar", "ALOO MATAR", "Fried potato cubes and green peas sautéed in a flavorful Indian sauce."],
    ["chole-bhature-only-for-dinner", "CHOLE BHATURE (Only for Dinner)", "Fluffy deep-fried Indian bread served with Punjabi-style spicy chickpea masala."],
    ["dal-palak", "DAL PALAK", "Punjabi-style spinach and lentils cooked with traditional Indian spices."],
    ["french-fries", "FRENCH FRIES", "Deep-fried potato fingers tossed with salt and pepper."],
    ["gulab-jamun", "GULAB JAMUN", "Deep-fried sweet dumplings steeped in sugar syrup."],
    ["kaai-kari-kurma", "KAAI KARI KURMA", "Mixed vegetables cooked in a coconut-based curry with traditional South Indian spices."],
    ["koon-curry", "KOON CURRY", "Mushroom curry in a Kerala-style coconut preparation."],
    ["malai-kofta", "MALAI KOFTA", "Shallow-fried cottage-cheese dumplings cooked in a rich, smooth gravy."],
    ["matar-mushroom", "MATAR MUSHROOM", "Mushrooms and green peas cooked with khoa and traditional spices."],
    ["matar-paneer", "MATAR PANEER", "Cottage cheese and green peas cooked in an onion-and-tomato sauce."],
    ["palak-paneer", "PALAK PANEER", "Soft cottage-cheese chunks simmered in spiced spinach purée and garnished with cream."],
    ["pav-bahji", "PAV BAHJI", "Mixed vegetables cooked in a special spice blend and served with bread shallow-fried in butter."],
    ["podi-uthappam", "PODI UTHAPPAM", "South Indian rice-and-lentil pancake topped with gunpowder (milagaipodi)."],
    ["poori-masala", "POORI MASALA", "Fluffy deep-fried Indian bread served with seasoned potato masala."],
    ["variety-rice-choose-from-bisi-bele-bhath-tamarind-rice-lemon-rice-curd-rice", "VARIETY RICE (Choose from Bisi-bele-bhath / Tamarind Rice / Lemon Rice / Curd Rice)", "A choice of traditional South Indian lunch-box rice recipes."],
    ["vegetable-cutlet", "VEGETABLE CUTLET", "Deep-fried mixed-vegetable snack served with chutney."],
  ].map(([itemId, itemName, description]) => ["osm-adyar-ananda-bhavan-638589103", itemId, itemName, description, "https://a2bva.com/menu/"]),
  ["osm-juliano-s-subs-pizza-12493934493", "jalapeno-poppers", "Jalapeno Poppers", "Six jalapeño poppers served with ranch.", "https://www.julianosva.com/menu"],
];

const round39ReviewedDescriptionCandidates = [
  ["hello-betty-north-bethesda-md", "coffee-or-tea", "Coffee or Tea", "Available with vanilla, hazelnut, or caramel flavor.", "https://www.hellobettybethesda.com/menu/breakfast/"],
  ["replacement-apero-washington-dc", "royal-trumpet-french-dip-sandwich", "Royal Trumpet French Dip Sandwich", "Caramelized onions, Gruyère, horseradish cream sauce, and mushroom au jus.", "https://static1.squarespace.com/static/650f7d73221264489123e767/t/6a85098ea21a6d39d705b67e/1787103630381/Dinner+Menu+8.18.26.pdf"],
  ["replacement-apero-washington-dc", "steamed-pei-mussels", "Steamed PEI Mussels", "Lemongrass and ginger broth, fried garlic, coriander, and Espelette oil.", "https://static1.squarespace.com/static/650f7d73221264489123e767/t/6a85098ea21a6d39d705b67e/1787103630381/Dinner+Menu+8.18.26.pdf"],
  ["replacement-district-rico-washington-dc", "family-special-1", "Family Special #1", "Whole chicken served with four large sides.", "https://www.districtrico.com/family-special-1/"],
  ["replacement-district-rico-washington-dc", "kids-rotisserie-meal", "Kids Rotisserie Meal", "Quarter chicken served with one side.", "https://www.districtrico.com/menu"],
  ["osm-not-your-average-joe-s-4719278718", "nyaj:ahi-tuna-wontons", "Ahi Tuna Wontons", "Choose chili-spiced crispy wontons or chilled cucumbers, topped with rare-seared sesame-crusted tuna, sweet soy glaze, pickled ginger, and wasabi aioli.", "https://www.notyouraveragejoes.com/items/ahi-tuna-wontons"],
  ["osm-not-your-average-joe-s-4719278718", "nyaj:cheesesteak-egg-rolls-hh", "Cheesesteak Egg Rolls (HH)", "Thinly sliced sirloin, caramelized onions, and cheese in a crispy egg-roll wrapper with spicy mustard.", "https://www.notyouraveragejoes.com/items/cheesesteak-egg-rolls"],
  ["osm-not-your-average-joe-s-4719278718", "nyaj:classic-caesar-salad-fs", "Classic Caesar Salad (FS)", "Crisp romaine hearts with house-made focaccia croutons, shaved Romano cheese, and lemon-garlic dressing.", "https://www.notyouraveragejoes.com/items/classic-caesar-salad-fs"],
  ["osm-not-your-average-joe-s-4719278718", "nyaj:joses-burrito-bowl", "Jose's Burrito Bowl", "Marinated grilled chicken, Mexican black beans, white rice, guacamole, shredded lettuce, pico de gallo, roasted corn, and lime crema.", "https://www.notyouraveragejoes.com/items/joses-burrito-bowl"],
  ["osm-not-your-average-joe-s-4719278718", "nyaj:mustard-crusted-chicken", "Mustard-Crusted Chicken", "Mustard-marinated chicken breaded with gluten-free bread crumbs, pan-seared, and served with green beans and mashed potatoes.", "https://www.notyouraveragejoes.com/items/mustard-crusted-chicken"],
  ["osm-not-your-average-joe-s-4719278718", "nyaj:teriyaki-glazed-salmon", "Teriyaki Glazed Salmon", "Grilled Atlantic salmon with citrus-teriyaki glaze and sesame seeds over pineapple fried rice.", "https://www.notyouraveragejoes.com/items/teriyaki-glazed-salmon"],
  ["osm-not-your-average-joe-s-4719278718", "nyaj:thats-fire-burger", "That's Fire Burger", "Cajun-spiced burger with pepper Jack, jalapeños, frickles, lettuce, tomato, and sriracha aioli, served with fries.", "https://www.notyouraveragejoes.com/items/thats-fire-burger"],
  ["osm-not-your-average-joe-s-4719278718", "nyaj:whipped-feta-dip", "Whipped Feta Dip", "Creamy feta, marinated garbanzo beans, sesame crisps, cucumbers, and warm house pita.", "https://www.notyouraveragejoes.com/items/whipped-feta-dip"],
];

const round38ReviewedDescriptionCandidates = [
  ["bukom-cafe-dc", "chicken-suya-2-pc-only", "CHICKEN SUYA 2 PC ONLY", "Grilled chicken coated with a peanut rub, fresh tomatoes, and onion.", "https://bukomdc.com/menu/"],
  ["bukom-cafe-dc", "jerk-wings-10-pc", "JERK WINGS 10 PC", "Wings marinated with habanero, lime juice, brown sugar, garlic, and herbs.", "https://bukomdc.com/menu/"],
  ["bukom-cafe-dc", "jerk-wings-5-pc", "JERK WINGS 5 PC", "Wings marinated with habanero, lime juice, brown sugar, garlic, and herbs.", "https://bukomdc.com/menu/"],
  ["bukom-cafe-dc", "spinach-stew-w-rice", "SPINACH STEW w/ RICE", "Spinach cooked into a West African stew, served with Jollof rice or house salad.", "https://bukomdc.com/menu/"],
  ["bukom-cafe-dc", "goat-stew-w-rice", "GOAT STEW w/ RICE", "Double-cooked goat in West African stew, served with Jollof rice or house salad.", "https://bukomdc.com/menu/"],
  ["chain-kung-fu-tea", "kft-kf-green-tea", "KF Green Tea", "Jasmine green tea sweetened with cane sugar.", "https://www.kungfutea.com/products/"],
  ["chain-kung-fu-tea", "kft-rosehip-lemonade", "Rosehip Lemonade", "Fresh-squeezed lemonade with hints of rosehip and blueberry; tart and fruity.", "https://www.kungfutea.com/products/"],
  ["chain-kung-fu-tea", "kft-kf-milk-tea", "KF Milk Tea", "Freshly brewed Earl Grey tea blended with cane sugar and milk powder.", "https://www.kungfutea.com/products/"],
  ["cane-dc", "salt-cod-buljol-with-bakes", "Salt Cod Buljol With Bakes", "A salad of salted cod, pimento peppers, Scotch bonnet, red onions, garlic, and culantro, served with floats (fried breads).", "https://www.cane-dc.com/lunch-menu/"],
  ["cane-dc", "snapper-escoveitch", "Snapper Escoveitch", "Whole fried snapper with pickled chilies, served with coconut rice.", "https://www.cane-dc.com/dinner-menu/"],
  ["l-auberge-chez-francois-washington-dc-dc-metro", "current-a-house-delicacy-braised-wagyu-beef-cheeks", "A House Delicacy: Braised Wagyu Beef Cheeks", "Braised Wagyu beef cheeks with wild mushrooms and sherry wine.", "https://www.laubergechezfrancois.com/wp-content/uploads/2026/02/LCF_LunchAlaCarteMenu_2_26.pdf"],
  ["l-auberge-chez-francois-washington-dc-dc-metro", "current-beluga-caviar-service-16500", "Beluga Caviar Service** 165.00 /", "Rich, buttery caviar with subtle oceanic notes, served with blinis, crème fraîche, egg white and yolk, red onion, and chives.", "https://www.laubergechezfrancois.com/wp-content/uploads/2026/06/LCF_DinnerAlaCarteMenu_6_26Rev2gazpachoandtomatosalad.pdf"],
  ["l-auberge-chez-francois-washington-dc-dc-metro", "current-golden-beet-tartare-v", "Golden Beet Tartare* (v)", "Golden beet tartare with vinaigrette maison, capers, and chives.", "https://www.laubergechezfrancois.com/wp-content/uploads/2026/02/LCF_LunchAlaCarteMenu_2_26.pdf"],
  ["l-auberge-chez-francois-washington-dc-dc-metro", "current-murrays-grilled-organic-chicken-breast", "Murray’s Grilled Organic Chicken Breast", "Grilled organic chicken breast with mushrooms, fresh thyme, and garden vegetables.", "https://www.laubergechezfrancois.com/wp-content/uploads/2026/02/LCF_LunchAlaCarteMenu_2_26.pdf"],
  ["l-auberge-chez-francois-washington-dc-dc-metro", "current-opulence-de-la-mer", "Opulence de la Mer", "Mediterranean sea bass, Norwegian salmon, Carolina shrimp, Maine lobster, diver scallops, jumbo lump crabmeat, and white lobster sauce.", "https://www.laubergechezfrancois.com/wp-content/uploads/2026/06/LCF_DinnerAlaCarteMenu_6_26Rev2gazpachoandtomatosalad.pdf"],
  ["bole-bole-ethiopian-kitchen-and-bar-herndon-va-dc-metro", "fish-salad", "FISH SALAD", "Tilapia with mixed greens, dried cranberries, croutons, and house dressing made with garlic, lemon, black pepper, and olive oil.", "https://bolebolerestaurant.com/menu-restaurant/"],
  ["bole-bole-ethiopian-kitchen-and-bar-herndon-va-dc-metro", "house-salad", "HOUSE SALAD", "Mixed greens, dried cranberries, croutons, and house dressing made with garlic, lemon, black pepper, and olive oil.", "https://bolebolerestaurant.com/menu-restaurant/"],
  ["osm-genova-pizza-12207810924", "battered-mushrooms", "Battered Mushrooms", "Served with ranch.", "https://www.genovapizzamenu.com/"],
  ["osm-giuseppi-s-pizza-3527237201", "the-duke", "The Duke", "Grilled mushrooms, onions, pizza sauce, and cheese.", "https://giuseppispizzaplus.com/giuseppis-food-menu"],
  ["replacement-easy-company-washington-dc", "roasted-garlic-and-parmesan-alfredo-pasta", "Roasted Garlic & Parmesan Alfredo Pasta", "Served with grilled bread; chicken or shrimp may be added.", "https://www.easycowharf.com/menus/"],
  ["replacement-code-red-washington-dc", "beef-tenderloin-skewers-2-gf", "BEEF TENDERLOIN SKEWERS (2) (GF)", "Served with chimichurri.", "https://www.codereddc.com/happy-hour-menu"],
];

const round37ReviewedDescriptionCandidates = [
  ["replacement-marx-cafe-revolutionary-cuisine-washington-dc", "chicken-piccata", "Chicken piccata", "Chicken breast, linguine, lemon, parsley, white wine, and capers.", "https://marxcafemtp.com/menu/"],
  ["replacement-marx-cafe-revolutionary-cuisine-washington-dc", "quesadilla-de-pollo", "Quesadilla de pollo", "Chicken, pepper Jack, pico de gallo, and guacamole.", "https://marxcafemtp.com/menu/"],
  ["replacement-marx-cafe-revolutionary-cuisine-washington-dc", "shrimp-scampi", "Shrimp scampi", "Shrimp, linguine, garlic, white wine, parsley, and red-pepper flakes.", "https://marxcafemtp.com/menu/"],
  ["replacement-marx-cafe-revolutionary-cuisine-washington-dc", "steak-crostini", "Steak Crostini", "Grilled hanger steak, pesto aioli, and arugula.", "https://marxcafemtp.com/menu/"],
  ["replacement-marx-cafe-revolutionary-cuisine-washington-dc", "wild-mushroom-crostini", "Wild Mushroom Crostini", "Sautéed mushrooms, garlic, herbs, and cream.", "https://marxcafemtp.com/menu/"],
  ["rare-steakhouse-dc", "gelato", "Gelato", "Daily selection.", "https://www.raresteaks.com/washington-dc-menus/"],
  ["rare-steakhouse-dc", "sorbet", "Sorbet", "Daily selection.", "https://www.raresteaks.com/washington-dc-menus/"],
  ["yellow-union-market-dc", "green-tomato-tatbili-hummus", "GREEN TOMATO TATBILI HUMMUS", "Jalapeño, garlic, and herbs.", "https://order.toasttab.com/online/yellow-union-market"],
  ["yellow-union-market-dc", "lamb-awarma-hummus", "LAMB AWARMA HUMMUS", "Pomegranate molasses and sumac onions.", "https://order.toasttab.com/online/yellow-union-market"],
  ["yellow-union-market-dc", "tahini-chocolate-chip-brownie", "TAHINI CHOCOLATE CHIP BROWNIE", "Chocolate-chip brownie with tahini.", "https://order.toasttab.com/online/yellow-union-market"],
  ...["sardi-s-pollo-a-la-brasa-beltsville-washington-dc-dc-metro", "sardi-s-pollo-a-la-brasa-langley-park-takoma-park-md-dc-metro"].flatMap((restaurantId) => [
    [restaurantId, "chicharron-de-pollo", "CHICHARRON DE POLLO", "Half a boneless chicken, marinated and fried.", "https://sardischicken.com/menu/"],
    [restaurantId, "chuletas-de-cerdo", "CHULETAS DE CERDO", "Three fresh center-cut pork chops.", "https://sardischicken.com/menu/"],
    [restaurantId, "ultimate-3-meat-combo", "ULTIMATE 3 MEAT COMBO", "Choice of three: chicken skewer, beef skewer, shrimp skewer, quarter chicken, center-cut pork chop, carne asada, or lamb chop.", "https://sardischicken.com/menu/"],
  ]),
];

const round36ReviewedDescriptionCandidates = [
  ["osm-ema-rossi-pizzeria-13912184601", "gelato", "Gelato", "Seasonal flavors.", "https://www.emarossipizzeria.com/menu"],
  ["replacement-kingbird-washington-dc", "yogurt-matcha-coconut-milk-honey-banana-d", "Matcha & Coconut Smoothie", "Yogurt, matcha, coconut milk, honey, and banana.", "https://www.kingbirddc.com/menus"],
  ["tuscarora-mill-restaurant-leesburg-va-dc-metro", "the-flank-steak-salad", "THE FLANK STEAK SALAD ~", "Crisp romaine, corn relish, grilled onions, and chipotle ranch.", "https://www.tuskies.com/menus"],
  ["luke-s-lobster-penn-quarter-washington-dc-dc-metro", "jonah-crab-roll", "Jonah Crab Roll", "Served Luke's Way with chips and a soft drink.", "https://lukeslobster.com/pages/menu"],
  ["replacement-the-lost-fox-ashburn-va", "deviled-eggs", "Deviled Eggs", "Virginia country ham and pickled mustard seeds.", "https://order.toasttab.com/online/the-lost-fox"],
  ["supra-dc", "gobi-friends-platter", "Gobi \"Friends' Platter\"", "Beet pkhali, collards pkhali, eggplant nigvzit, jonjoli salad, house-made sulguni-herb gebjalia, pickled cabbage, Imeretian ajika, and shotis puri.", "https://supradc.com/menu"],
  ["supra-dc", "gobi-friends-platter-n", "Gobi \"Friends' Platter\" (N)", "Beet pkhali, collards pkhali, eggplant nigvzit, jonjoli salad, house-made sulguni-herb gebjalia, pickled cabbage, Imeretian ajika, and shotis puri.", "https://supradc.com/menu"],
  ["supra-dc", "georgian-salad", "Georgian Salad", "Heirloom tomato, cucumber, walnut, red onion, fresh herbs, and sunflower-herb vinaigrette.", "https://supradc.com/menu"],
  ["clydes-gallery-place-dc", "crab-and-artichoke-dip", "CRAB & ARTICHOKE DIP", "Crab-and-artichoke dip served with baguette and lemon.", "https://www.clydes.com/location/gallery-place/#menus"],
  ["clydes-gallery-place-dc", "caesar-salad", "CAESAR SALAD", "Caesar salad with Grana Padano and croutons.", "https://www.clydes.com/location/gallery-place/#menus"],
  ["clydes-gallery-place-dc", "pigs-in-a-blanket", "PIGS IN A BLANKET", "Served with mustard dipping sauce.", "https://www.clydes.com/location/gallery-place/#menus"],
  ["kiin-imm-thai-rockville-dc-metro", "panang-curry", "Panang Curry", "Choice of meat with Panang curry paste, coconut milk, crushed peanut, bell pepper, and broccoli, served with jasmine rice; peanut cannot be omitted.", "https://order.toasttab.com/online/kiin-imm-thai-785-g-rockville-pike"],
  ["kiin-imm-thai-rockville-dc-metro", "pineapple-beef-salad", "Pineapple Beef Salad", "Sliced grilled beef, pineapple, tomato, cilantro, red onion, scallion, lettuce, spices, and fresh lime juice.", "https://order.toasttab.com/online/kiin-imm-thai-785-g-rockville-pike"],
  ["topgolf-national-harbor-washington-dc-dc-metro", "cobb-salad-gf-dollar1499-710-1010-cal", "COBB SALAD GF $14.99 710-1010 cal", "Bacon, egg, grape tomatoes, avocado, shredded cheddar, scallions, and grilled marinated chicken.", "https://topgolf.com/us/national-harbor/food-and-drink/"],
  ["topgolf-national-harbor-washington-dc-dc-metro", "mediterranean-trio-v-dollar1549-850-cal", "MEDITERRANEAN TRIO V $15.49 850 cal", "Tzatziki, baba ghanoush, roasted-red-pepper hummus, celery, carrots, cucumber, red peppers, and grilled flatbread.", "https://topgolf.com/us/national-harbor/food-and-drink/"],
  ["topgolf-national-harbor-washington-dc-dc-metro", "the-scramble-dollar1099-1670-cal", "THE SCRAMBLE $10.99 1670 cal", "Tater tots, bacon, breakfast sausage, scrambled eggs, and melted mozzarella, served with house salsa.", "https://topgolf.com/us/national-harbor/food-and-drink/"],
  ["topgolf-national-harbor-washington-dc-dc-metro", "the-smokehouse-burger-dollar1599-1290-cal", "THE SMOKEHOUSE BURGER $15.99 1290 cal", "Smash burger with bacon, barbecue sauce, cheddar, lettuce, tomato, onion, and secret sauce.", "https://topgolf.com/us/national-harbor/food-and-drink/"],
  ["tuscarora-mill-restaurant-leesburg-va-dc-metro", "th-e-ba-r-n-ya-r-d-a-u-ju-s", "TH E BA R N YA R D “A U JU S ” ~", "Smoked beef brisket and pork, caramelized onions, provolone, pepper spread, and arugula on everything ciabatta.", "https://www.tuskies.com/menus"],
  ["o-ku-washington-dc-dc-metro", "kampachi", "Kampachi", "Amberjack.", "https://www.o-kusushi.com/location/o-ku-washington-dc/#menus"],
  ["o-ku-washington-dc-dc-metro", "saba", "Saba", "Mackerel.", "https://www.o-kusushi.com/location/o-ku-washington-dc/#menus"],
  ["o-ku-washington-dc-dc-metro", "hotate", "Hotate", "Scallop.", "https://www.o-kusushi.com/location/o-ku-washington-dc/#menus"],
  ["o-ku-washington-dc-dc-metro", "kurodai", "Kurodai", "Dorade.", "https://www.o-kusushi.com/location/o-ku-washington-dc/#menus"],
  ["osm-kazan-2296474079", "coban-salatasi-turkish-shepherds-salad", "Coban Salatasi (Turkish Shepherd’s Salad)", "Diced tomatoes, cucumbers, green peppers, onions, parsley, black olives, olive oil, and Turkish feta.", "https://www.kazanrestaurant.com/menu"],
  ["trio-grill-falls-church-va", "fettucine-primavera", "Fettucine Primavera", "Egg fettuccine, English peas, asparagus, Roman artichoke, roasted mushrooms, baby spinach, basil pesto, roasted-red-pepper butter, breadcrumbs, and Parmesan.", "https://www.triomerrifield.com/menus"],
  ["trio-grill-falls-church-va", "new-york-strip", "NEW YORK STRIP", "Fourteen-ounce Allen Brothers strip with a whole roasted sweet shallot and choice of side.", "https://www.triomerrifield.com/menus"],
];

const round35ReviewedDescriptionCandidates = [
  ["air-restaurant-washington-dc-dc-metro", "chopped-salad", "Chopped Salad", "Greens, cucumber, tomato, carrots, croutons, and buttermilk dressing.", "https://airrestaurantandlounge.com/menu"],
  ["air-restaurant-washington-dc-dc-metro", "grilled-lamb-chops", "Grilled Lamb Chops", "Served with mashed potatoes and the day's vegetable.", "https://airrestaurantandlounge.com/menu"],
  ["osm-amphora-diner-deluxe-152763392", "chicken-breast-club", "Chicken Breast Club", "Marinated chicken breast, bacon, lettuce, tomato, and mayonnaise, served with coleslaw and a pickle.", "https://amphoragroup.com/wp-content/uploads/2026/04/Amphora-Diner-Deluxe-Menu.pdf"],
  ["replacement-scarlet-oak-restaurant-and-bar-washington-dc", "carne-asada-burrito", "Carne Asada Burrito", "Soft-scrambled eggs, pepper Jack, potatoes, charred onion-jalapeño and red-cabbage slaw, red salsa, crema, and nacho cheese, served with mixed greens.", "https://www.scarletoakdc.com/"],
  ["replacement-scarlet-oak-restaurant-and-bar-washington-dc", "veggie-burrito", "Veggie Burrito", "Soft-scrambled eggs, rice, black beans, pepper Jack, roasted sweet potato and red peppers, grilled onions, tomato, avocado mash, grilled Hatch chiles, and Lizano sauce.", "https://www.scarletoakdc.com/"],
  ["belga-cafe-washington-dc-dc-metro", "n-a-pero-hour", "N.A.Pero Hour", "Spritz Del Conte Classico, club soda, blood orange, and ice.", "https://www.belgacafe.com/menu"],
  ["belga-cafe-washington-dc-dc-metro", "mussels-mariniere-the-classique", "Mussels ‘mariniere’ the Classique", "PEI mussels, white wine, shallots, celery, butter, garlic, and parsley, served with Belgian fries and mayonnaise.", "https://www.belgacafe.com/menu"],
  ["billy-hicks-georgetown-dc", "wings", "Wings", "Six or twelve jumbo chicken wings with celery, carrots, blue cheese, and ranch; available with buffalo, mambo, garlic-Parmesan, or barbecue-lemon-pepper sauce.", "https://billyhicks.com/wp-content/uploads/2024/11/BH-Menu.pdf"],
];

const round34ReviewedDescriptionCandidates = [
  ["bistrot-du-coin-washington-dc-dc-metro", "bistrot-du-coin:salade-de-betteraves", "SALADE DE BETTERAVES", "Beets, feta, mixed greens, olives, cherry tomatoes, and almonds.", "https://www.bistrotducoin.com/"],
  ["bistrot-du-coin-washington-dc-dc-metro", "bistrot-du-coin:salade-nic-oise", "SALADE NIÇOISE", "Mesclun, seasonal vegetables, confit tuna, anchovies, eggs, artichokes, and olives.", "https://www.bistrotducoin.com/"],
  ["chard-mclean-va-dc-metro", "chard:original-chard", "Original Char'd", "Grass-fed beef, American cheese, lettuce, onion, pickle, and CHAR'D sauce.", "https://www.chardeats.com/menu.html"],
  ["chard-mclean-va-dc-metro", "chard:double-original-chard", "Double Original Char'd", "Double grass-fed beef, American cheese, lettuce, onion, pickle, and CHAR'D sauce.", "https://www.chardeats.com/menu.html"],
  ["chard-mclean-va-dc-metro", "chard:hot-chard", "Hot Char'd", "Grass-fed beef, American cheese, onion, lettuce, pickled jalapeños, and Hot CHAR'D sauce.", "https://www.chardeats.com/menu.html"],
  ["chard-mclean-va-dc-metro", "chard:double-hot-chard", "Double Hot Char'd", "Double grass-fed beef, American cheese, lettuce, onion, pickled jalapeños, and Hot CHAR'D sauce.", "https://www.chardeats.com/menu.html"],
  ["chard-mclean-va-dc-metro", "chard:vanilla-shake", "Vanilla Shake", "Hand-spun with whole-milk vanilla ice cream.", "https://www.chardeats.com/menu.html"],
  ["chard-mclean-va-dc-metro", "chard:chocolate-shake", "Chocolate Shake", "Hand-spun with whole-milk chocolate ice cream and chocolate shavings.", "https://www.chardeats.com/menu.html"],
  ["chard-mclean-va-dc-metro", "chard:strawberry-shake", "Strawberry Shake", "Hand-spun with whole-milk vanilla ice cream and real strawberries.", "https://www.chardeats.com/menu.html"],
  ["chard-mclean-va-dc-metro", "chard:duck-fat-fries", "Duck Fat Fries", "Golden fries cooked in duck fat and served with organic ketchup.", "https://www.chardeats.com/menu.html"],
  ["patsy-s-american-vienna-va-dc-metro", "crab-cake-and-filet-mignon", "Crab Cake & Filet Mignon", "Served with mashed potatoes.", "https://order.greatamericanrestaurants.com/api/vendors/patsys-american"],
  ["osm-bistro-provence-4829739070", "fricassee-escargots-champignons-de-chene", "Fricassée d’Escargots de Bourgogne, Purée Fine d’Aubergines, Champignons de Chêne", "Burgundy escargot fricassee with oyster mushrooms, eggplant purée, and garlic butter.", "http://bistroprovence.org/menu/"],
  ["osm-bistro-provence-4829739070", "creme-asperges-flan-parmesan-ecume-lait", "Crème d’Asperges Vertes, Flan de Parmesan, Ecume de lait", "Green-asparagus cream with Parmesan flan and milk foam.", "http://bistroprovence.org/menu/"],
  ["osm-bistro-provence-4829739070", "salade-poivrons-rotis-chevre-anchois", "Salade de Poivrons Rôtis, Huile d’olives Vierge, Fromage de Chèvre, Anchois", "Roasted-pepper salad with extra-virgin olive oil, goat cheese, and anchovies.", "http://bistroprovence.org/menu/"],
  ["osm-bistro-provence-4829739070", "poitrine-poulet-polenta-morilles", "Poitrine de Poulet de Ferme Rôti, Gateau de Polenta en Croute de Parmesan, Ficasse de Morilles", "Roast chicken breast with Parmesan-crusted polenta and morel mushrooms.", "http://bistroprovence.org/menu/"],
  ["osm-bistro-provence-4829739070", "poitrine-canard-foie-gras-aubergine", "Poitrine de canard rôtie, Terrine de Foie Gras, Puree d’aubergines au Cumin, Jus au Olive", "Roasted duck breast with foie-gras terrine, cumin eggplant purée, and olive jus.", "http://bistroprovence.org/menu/"],
  ["osm-bistro-provence-4829739070", "choux-bruxelles-poeles", "Choux Bruxelles Poeles", "Sautéed Brussels sprouts.", "http://bistroprovence.org/menu/"],
  ["osm-bistro-provence-4829739070", "gateau-polenta-ecume-lait-parmesan", "Gateau de Polenta, Ecume de Lait, Parmesan", "Polenta cake with milk foam and Parmesan cheese.", "http://bistroprovence.org/menu/"],
  ["osm-bistro-provence-4829739070", "ratatouillie-de-provence", "Ratatouillie de Provence", "Provençal ratatouille.", "http://bistroprovence.org/menu/"],
  ["replacement-antonelli-s-pizza-lorton-va", "cheese-bread-sticks", "CHEESE BREAD STICKS", "Covered in garlic and melted mozzarella; served with marinara dipping sauce.", "https://antonellis-pizza.com/wp-content/uploads/2025/08/Final-Menu-June-2025.pdf"],
  ["replacement-antonelli-s-pizza-lorton-va", "chicken-parmigiana-dinner", "CHICKEN PARMIGIANA DINNER", "Breaded or grilled chicken with marinara and melted mozzarella, served with spaghetti.", "https://antonellis-pizza.com/wp-content/uploads/2025/08/Final-Menu-June-2025.pdf"],
  ["replacement-antonelli-s-pizza-lorton-va", "greek-chicken-salad", "GREEK CHICKEN SALAD", "Greek salad topped with grilled chicken and served with pita bread.", "https://antonellis-pizza.com/wp-content/uploads/2025/08/Final-Menu-June-2025.pdf"],
  ["replacement-antonelli-s-pizza-lorton-va", "greek-gyro-salad", "GREEK GYRO SALAD", "Greek salad topped with gyro meat, served with yogurt sauce and pita bread.", "https://antonellis-pizza.com/wp-content/uploads/2025/08/Final-Menu-June-2025.pdf"],
  ["replacement-antonelli-s-pizza-lorton-va", "spaghetti-marinara", "SPAGHETTI MARINARA", "Spaghetti tossed in house-made marinara sauce.", "https://antonellis-pizza.com/wp-content/uploads/2025/08/Final-Menu-June-2025.pdf"],
  ["replacement-la-gelatteria-kensington-md", "chef-edwin-mexican-salvadorian-style-sandwich-deli", "Chef Edwin Mexican-Salvadorian style sandwich! Deli", "Deli-style turkey ham, avocado, tomato, onion, spring mix, provolone, and chipotle-mayo sauce on ciabatta.", "https://lagelatteria.com/"],
  ["replacement-la-gelatteria-kensington-md", "cuban-style-sandwich", "CUBAN STYLE SANDWICH", "Roasted pork, cheddar, turkey ham, pickles, mustard, and mayonnaise on ciabatta.", "https://lagelatteria.com/"],
  ["replacement-la-gelatteria-kensington-md", "impossible-veggie-burger-dollar16-vegetarian", "IMPOSSIBLE VEGGIE BURGER $16 VEGETARIAN", "Spring mix, tomato, cheddar, pickles, onion, and aioli mayonnaise on a brioche bun.", "https://lagelatteria.com/"],
  ["replacement-la-gelatteria-kensington-md", "spring-summer-berries-mixed-salad", "SPRING-SUMMER BERRIES MIXED SALAD", "Spring mix, fresh berries, croutons, radish, shaved Parmesan, walnuts, and citrus dressing.", "https://lagelatteria.com/"],
  ["replacement-la-gelatteria-kensington-md", "the-california-style-vegetarian-bagel", "The California Style Vegetarian Bagel", "Cream cheese, tomato, cucumber, onion, capers, and avocado; hummus is optional.", "https://lagelatteria.com/"],
  ["replacement-la-gelatteria-kensington-md", "the-new-yorker-bagel-lox-dollar145", "The New Yorker Bagel Lox -$14.5", "Smoked salmon, cream cheese, tomato, onion, pickled cucumber, and capers; egg is optional.", "https://lagelatteria.com/"],
  ["replacement-la-gelatteria-kensington-md", "tuna-salad-sandwich", "TUNA SALAD SANDWICH", "Served hot with cheddar, onions, cornichons, and Old Bay on whole wheat, or cold with aioli, capers, pepperoncini, and lemon zest on a toasted baguette.", "https://lagelatteria.com/"],
  ["replacement-the-district-fishwife-washington-dc", "shrimp-pupusa-ea", "Shrimp Pupusa (ea)", "A handmade corn tortilla stuffed with cheese and shrimp.", "https://www.thedistrictfishwife.com/"],
  ["replacement-cordelia-fishbar-washington-dc", "bread-pudding", "Bread Pudding ·", "Burnt marshmallow with graham-cracker ice cream.", "https://cordeliafishbar.com/"],
  ["rappahannock-oyster-bar-wharf-dc", "burger", "Burger", "Creekstone Farms brisket-and-short-rib blend, sharp white cheddar, applewood-smoked bacon, lettuce, and secret sauce on a toasted brioche bun.", "https://www.rroysters.com/wharf-menu"],
];

const round33ReviewedDescriptionCandidates = [
  ["officina-wharf-dc", "chicken-salsiccia", "Chicken Salsiccia", "Apple chicken sausage.", "https://www.officinadc.com/wharf-menus/"],
  ["officina-wharf-dc", "smoked-bacon", "Smoked Bacon", "Slab-smoked bacon.", "https://www.officinadc.com/wharf-menus/"],
  ["quarterdeck-arlington-va-dc-metro", "crab-cake-sliders", "Crab Cake Sliders", "Four crab cakes.", "https://www.quarterdeckarlington.com/menu"],
  ["replacement-tap99-washington-dc", "bruschetta-nachos", "Bruschetta Nachos", "Vine-ripe tomatoes, balsamic glaze, extra-virgin olive oil, basil, and Parmesan-herb crostini.", "https://tap-99.com/menu/"],
  ...["dig", "dig-bethesda"].flatMap((restaurantId) => [
    [restaurantId, "charred-chicken-thigh", "Charred Chicken Thigh", "Skinless chicken thigh with a marinade of olive oil, yellow onion, sea salt, water, coriander, mustard seed, lemon, onion powder, smoked sweet paprika, and fennel seed.", "https://www.diginn.com/nutrition/"],
    [restaurantId, "herb-roasted-chicken-breast", "Herb-Roasted Chicken Breast", "Chicken breast with a marinade of canola oil, garlic, parsley, rosemary, oregano, thyme, coriander, paprika, and sea salt.", "https://www.diginn.com/nutrition/"],
    [restaurantId, "classic-brown-rice", "Classic Brown Rice", "Brown rice, water, sea salt, bay leaf, garlic oil, lime juice, and parsley.", "https://www.diginn.com/nutrition/"],
    [restaurantId, "herb-rice", "Herb Rice", "Brown rice, water, sea salt, bay leaf, cilantro purée, and parsley.", "https://www.diginn.com/nutrition/"],
    [restaurantId, "pesto", "Pesto", "Olive oil, canola oil, water, cider vinegar, basil, garlic, caper, parsley, shallot, mustard, sea salt, and black pepper.", "https://www.diginn.com/nutrition/"],
    [restaurantId, "roasted-sweet-potatoes", "Roasted Sweet Potatoes", "Sweet potato, paprika, canola oil, sea salt, black pepper, water, rosemary oil, and flaky sea salt.", "https://www.diginn.com/nutrition/"],
    [restaurantId, "sheet-tray-carrots", "Sheet-Tray Carrots", "Coriander-spiced carrots with garlic oil, chili flakes, gremolata pesto, lemon, and flaky sea salt.", "https://www.diginn.com/nutrition/"],
  ]),
  ["ariake-japanese-restaurant-reston-va-dc-metro", "01-shrimp-and-vegetable-tempura", "01. Shrimp & Vegetable Tempura", "Served with chicken teriyaki.", "https://www.ariakerestaurant.com/menu"],
  ["ariake-japanese-restaurant-reston-va-dc-metro", "02-shrimp-and-vegetable-tempura", "02. Shrimp & Vegetable Tempura", "Served with beef teriyaki.", "https://www.ariakerestaurant.com/menu"],
  ["ariake-japanese-restaurant-reston-va-dc-metro", "03-shrimp-and-vegetable-tempura", "03. Shrimp & Vegetable Tempura", "Served with salmon teriyaki.", "https://www.ariakerestaurant.com/menu"],
  ["ariake-japanese-restaurant-reston-va-dc-metro", "07-shrimp-and-vegetable-tempura", "07. Shrimp & Vegetable Tempura", "Served with fried oysters.", "https://www.ariakerestaurant.com/menu"],
  ["ariake-japanese-restaurant-reston-va-dc-metro", "hamachi-maki", "Hamachi Maki", "Yellowtail.", "https://www.ariakerestaurant.com/menu"],
  ["ariake-japanese-restaurant-reston-va-dc-metro", "kappa-maki", "Kappa Maki", "Cucumber.", "https://www.ariakerestaurant.com/menu"],
  ["ariake-japanese-restaurant-reston-va-dc-metro", "tekka-makki", "Tekka Makki", "Tuna.", "https://www.ariakerestaurant.com/menu"],
  ["ariake-japanese-restaurant-reston-va-dc-metro", "bincho", "Bincho", "Albacore.", "https://www.ariakerestaurant.com/menu"],
  ["ariake-japanese-restaurant-reston-va-dc-metro", "hamachi", "Hamachi", "Yellowtail.", "https://www.ariakerestaurant.com/menu"],
  ["ariake-japanese-restaurant-reston-va-dc-metro", "hotategai", "Hotategai", "Scallop.", "https://www.ariakerestaurant.com/menu"],
  ["ariake-japanese-restaurant-reston-va-dc-metro", "ika", "Ika", "Squid.", "https://www.ariakerestaurant.com/menu"],
  ["ariake-japanese-restaurant-reston-va-dc-metro", "maguro", "Maguro", "Tuna.", "https://www.ariakerestaurant.com/menu"],
  ["ariake-japanese-restaurant-reston-va-dc-metro", "tako", "Tako", "Octopus.", "https://www.ariakerestaurant.com/menu"],
  ["ariake-japanese-restaurant-reston-va-dc-metro", "white-fish", "White Fish", "Rockfish.", "https://www.ariakerestaurant.com/menu"],
  ["ariake-japanese-restaurant-reston-va-dc-metro", "20-tuna-sashimi-lunch", "20. Tuna Sashimi Lunch", "Eight pieces of tuna.", "https://www.ariakerestaurant.com/menu"],
  ["barrel-and-bushel-tysons-va-dc-metro", "current-hot-fried-chicken-entree", "Hot Fried Chicken Entrée", "Crispy buttermilk chicken quarters, French toast, B&B pickles, hot sauce, butter, and amber maple syrup.", "https://www.barrelandbushel.com/menu"],
  ["barrel-and-bushel-tysons-va-dc-metro", "current-pub-burger", "Pub Burger", "Grass-fed beef patty, whole-grain mustard, cremini-stout marmalade, Cooper cheese, onion crisp, B&B pickles, brioche bun, and seasoned fries.", "https://www.barrelandbushel.com/menu"],
  ["barrel-and-bushel-tysons-va-dc-metro", "current-berries-bowl", "Berries Bowl", "Blueberries, strawberries, and blackberries.", "https://www.barrelandbushel.com/menu"],
  ["barrel-and-bushel-tysons-va-dc-metro", "current-fruit-bowl", "Fruit Bowl", "Melons, pineapple, and strawberries.", "https://www.barrelandbushel.com/menu"],
  ["barrel-and-bushel-tysons-va-dc-metro", "current-grilled-chicken-blt-salad", "Grilled Chicken BLT Salad", "Buttermilk chicken breast, romaine, smoked bacon, heirloom cherry tomatoes, creamy oregano-Parmesan dressing, and crusty ciabatta.", "https://www.barrelandbushel.com/menu"],
  ["barrel-and-bushel-tysons-va-dc-metro", "current-harvest-bowl", "Harvest Bowl", "Hearty grains, classic hummus, cucumber tzatziki, mixed greens, heirloom cherry tomatoes, Parmesan, and balsamic vinaigrette.", "https://www.barrelandbushel.com/menu"],
  ["barrel-and-bushel-tysons-va-dc-metro", "current-mezze-breakfast-bowl", "Mezze Breakfast Bowl", "Hearty grains, hummus, cucumber, tomato, Kalamata olives, tzatziki, feta, and over-medium eggs.", "https://www.barrelandbushel.com/menu"],
  ["cafe-milano-washington-dc-dc-metro", "bagel", "Bagel", "House bagel with smoked salmon, tomatoes, red onions, and whipped feta-goat cheese.", "https://www.cafemilano.com/menu/"],
  ["cafe-milano-washington-dc-dc-metro", "bread-selection", "Bread Selection", "Whole-wheat bread, rustic country loaf, house-made focaccia, crispy grissini, and carasau flatbread, served with marinated olives, sun-dried-tomato tapenade, and Italian extra-virgin olive oil.", "https://www.cafemilano.com/menu/"],
  ["cafe-milano-washington-dc-dc-metro", "insalata-duomo", "Insalata Duomo", "Romaine lettuce, green apple, walnuts, Pecorino, and balsamic vinaigrette.", "https://www.cafemilano.com/menu/"],
  ["cafe-milano-washington-dc-dc-metro", "insalata-milano", "Insalata Milano", "Baby arugula, fennel, lemon, olive oil, and Pecorino.", "https://www.cafemilano.com/menu/"],
  ["cafe-milano-washington-dc-dc-metro", "insalata-nizzarda", "Insalata Nizzarda", "Baby romaine, tuna, haricots verts, steamed potatoes, Taggiasche olives, cherry tomatoes, and hard-boiled eggs.", "https://www.cafemilano.com/menu/"],
  ["cafe-milano-washington-dc-dc-metro", "insalatina-jj", "Insalatina JJ", "Butter lettuce, lemon vinaigrette, candied almonds, and mild Gorgonzola.", "https://www.cafemilano.com/menu/"],
  ["cafe-milano-washington-dc-dc-metro", "panzanella-jk", "Panzanella JK", "Chopped radicchio and Belgian endive, cherry tomatoes, Taggiasche olives, celery, avocado, cucumber, and balsamic vinaigrette.", "https://www.cafemilano.com/menu/"],
  ["cafe-milano-washington-dc-dc-metro", "parmigiana-di-zucchine", "Parmigiana di Zucchine", "Zucchini Parmigiana, green-pea sauce, lemon gel, and mozzarella.", "https://www.cafemilano.com/menu/"],
  ["cafe-milano-washington-dc-dc-metro", "spaghetti-kiton", "Spaghetti Kiton", "Spaghetti, Manila clams, cherry tomatoes, spicy garlic, and extra-virgin olive oil.", "https://www.cafemilano.com/menu/"],
  ["cafe-milano-washington-dc-dc-metro", "via-condotti", "Via Condotti", "Fior di latte mozzarella, Pecorino Romano, spring onions, and eggs.", "https://www.cafemilano.com/menu/"],
  ["cafe-milano-washington-dc-dc-metro", "via-verdi", "Via Verdi", "Fior di latte mozzarella, mortadella, toasted pistachio, and burrata.", "https://www.cafemilano.com/menu/"],
  ["cafe-milano-washington-dc-dc-metro", "scaloppine", "Scaloppine", "Pan-seared veal scaloppini with fresh lemon, white-wine butter sauce, and briny capers.", "https://www.cafemilano.com/menu/"],
  ["the-pub-and-the-people-washington-dc-dc-metro", "butternut-squash-soup-cup", "Butternut Squash Soup Cup", "Butternut squash, yellow onions, garlic, ginger, fresh sage, rosemary, and thyme; served with garlic-buttered crostini.", "https://www.thepubandthepeople.com/menu"],
  ["the-pub-and-the-people-washington-dc-dc-metro", "mediterranean-salad", "Mediterranean Salad", "Arugula, couscous, cherry tomato, red onion, cucumber, corn, dried cranberries, queen olives, feta, and lemon-Dijon dressing.", "https://www.thepubandthepeople.com/menu"],
  ["the-pub-and-the-people-washington-dc-dc-metro", "pub-club-sandwich", "Pub Club Sandwich", "Honey ham, turkey, bacon, lettuce, tomato, and chipotle mayonnaise on toasted pain de mie.", "https://www.thepubandthepeople.com/menu"],
  ["the-pub-and-the-people-washington-dc-dc-metro", "shrimp-tostadas", "Shrimp Tostadas", "Three fried corn tortillas with guacamole, mango, pico de gallo, sour cream, cilantro, and garlic-buttered shrimp.", "https://www.thepubandthepeople.com/menu"],
  ["osm-galae-thai-2245510910", "crab-meat-fried-rice-dollar", "Crab Meat Fried Rice", "Jasmine rice stir-fried with crab meat, scallion, carrot, onion, tomato, and egg.", "https://img1.wsimg.com/blobby/go/81fc783d-02b1-4bf9-91a5-4e6cf106ac73/Galae%20Thai%202024.pdf"],
  ["osm-galae-thai-2245510910", "fried-rice-side-order-dollar", "Fried Rice Side Order", "A small order of jasmine rice stir-fried with carrot, tomato, onion, egg, and scallion.", "https://img1.wsimg.com/blobby/go/81fc783d-02b1-4bf9-91a5-4e6cf106ac73/Galae%20Thai%202024.pdf"],
  ["osm-galae-thai-2245510910", "nam-tok-salad-dollar", "Nam Tok Salad", "Grilled beef tossed with spices, onion, scallion, cilantro, mint, and spicy lime dressing.", "https://img1.wsimg.com/blobby/go/81fc783d-02b1-4bf9-91a5-4e6cf106ac73/Galae%20Thai%202024.pdf"],
  ["osm-galae-thai-2245510910", "pineapple-fried-rice-dollar", "Pineapple Fried Rice", "Shrimp and jasmine rice sautéed with pineapple, cashews, carrot, onion, scallion, tomato, and egg.", "https://img1.wsimg.com/blobby/go/81fc783d-02b1-4bf9-91a5-4e6cf106ac73/Galae%20Thai%202024.pdf"],
  ["fish-taco-bethesda-md", "shrimp-and-mango-ceviche", "Shrimp & Mango Ceviche", "Avocado, mango pico, jalapeño, radish, cilantro, and lime juice.", "https://www.fishtacoonline.com/menu"],
  ["replacement-the-dons-wood-fired-pizza-sterling-va", "current:antipasto-side", "Antipasto Side", "Seasonal lettuce, roasted red peppers, Roma tomatoes, Kalamata olives, onions, mozzarella, ham, salami, olive oil, and red-wine vinegar.", "https://www.thedonspizza.com/sites/default/files/DonsPizzaMenuDec01.pdf"],
  ["replacement-the-dons-wood-fired-pizza-sterling-va", "current:the-caprese-side", "The Caprese Side", "Seasonal lettuce, Roma tomatoes, fresh-made mozzarella, basil, red onions, olive oil, and balsamic vinegar.", "https://www.thedonspizza.com/sites/default/files/DonsPizzaMenuDec01.pdf"],
  ["replacement-the-dons-wood-fired-pizza-sterling-va", "current:the-greek-escape-side", "The Greek Escape Side", "Seasonal lettuce, roasted red peppers, red onions, feta, Kalamata olives, pepperoncini, olive oil, and red-wine vinegar.", "https://www.thedonspizza.com/sites/default/files/DonsPizzaMenuDec01.pdf"],
  ["replacement-the-dons-wood-fired-pizza-sterling-va", "current:the-italian-side", "The Italian Side", "Mixed leaf lettuce, Roma tomatoes, portobello mushrooms, cucumbers, red onions, olive oil, and balsamic vinegar.", "https://www.thedonspizza.com/sites/default/files/DonsPizzaMenuDec01.pdf"],
  ["replacement-tap99-washington-dc", "caesar-salad", "Caesar Salad", "Romaine lettuce, shaved Parmesan, herbed croutons, and house-made Caesar dressing.", "https://tap-99.com/menu/"],
  ["replacement-tap99-washington-dc", "cheese-byo", "Cheese BYO", "House red sauce with shredded mozzarella cheese.", "https://tap-99.com/menu/"],
  ["replacement-tap99-washington-dc", "hand-cut-fries", "Hand-Cut Fries", "Potatoes cut in-house and fried.", "https://tap-99.com/menu/"],
  ["replacement-tap99-washington-dc", "me-so-spicy", "Me So Spicy", "Spicy red sauce, soppressata, Calabrian chilies, fresh mozzarella, and Mike's Hot Honey.", "https://tap-99.com/menu/"],
  ["replacement-tap99-washington-dc", "mozzarella-cheese-bites", "Mozzarella Cheese Bites", "Mozzarella, panko breadcrumbs, marinara, basil oil, and balsamic reduction.", "https://tap-99.com/menu/"],
  ["replacement-tap99-washington-dc", "pickle-me-silly", "Pickle Me Silly", "White sauce, Boursin cheese, dill pickle, ranch, and dill.", "https://tap-99.com/menu/"],
  ["replacement-tap99-washington-dc", "pretzel-bombs", "Pretzel Bombs", "Fresh Lyon's pretzel rolls with Boursin and Parmesan cheese.", "https://tap-99.com/menu/"],
  ["replacement-tap99-washington-dc", "the-lorraine", "The Lorraine", "White sauce, baby spinach, and truffle oil.", "https://tap-99.com/menu/"],
  ["floreria-atlantico-dc", "oysters", "Oysters", "Seaweed chimichurri.", "https://www.floreriaatlantico.com/menu"],
  ["floreria-atlantico-dc", "tortilla-and-gambas", "Tortilla & Gambas", "Potato and garlic prawns.", "https://www.floreriaatlantico.com/menu"],
];

const round32ReviewedDescriptionCandidates = [
  ["lapis-dc", "mixed-grill", "Mixed Grill", "Chicken, lamb, and steak.", "https://order.toasttab.com/online/lapis"],
  ["lapis-dc", "nask-soup", "Nask-Soup", "Yellow lentils and vegetables.", "https://order.toasttab.com/online/lapis"],
  ["barca-pier-and-wine-bar-alexandria-va-dc-metro", "beef-kebab", "Beef Kebab", "Garlic yogurt and herbs.", "https://www.barcaalx.com/menu"],
  ["barca-pier-and-wine-bar-alexandria-va-dc-metro", "burnt-basque-cheesecake", "Burnt Basque Cheesecake", "Strawberries and grapefruit.", "https://www.barcaalx.com/menu"],
  ["replacement-circa-at-the-boro-tysons-va", "blackenedchickenmango", "Blackened Chicken Mango", "Mixed greens, red grapes, mangoes, marinated tomatoes, cashews, dried cranberries, and pickled-ginger vinaigrette.", "https://images.getbento.com/accounts/171bed38598ba1bdc6e5507cc27db6c9/media/FDBlplffRUGph3spaBOR_CIRCA%20-%20BORO%20-%20SPRING%202026%20-%20LUNCH.pdf"],
  ["replacement-circa-at-the-boro-tysons-va", "brunchburger", "Brunch Burger", "Creekstone Farms beef, applewood-smoked bacon, white cheddar, tarragon aioli, caramelized onions, sunny-side-up egg, English muffin, and home fries.", "https://images.getbento.com/accounts/171bed38598ba1bdc6e5507cc27db6c9/media/heH2ZrFIQUCnNcwklCi6_CIRCA%20-%20BORO%20-%20SPRING%202026%20-%20BRUNCH.pdf"],
  ["replacement-circa-at-the-boro-tysons-va", "circaburger", "Circa Burger", "Creekstone Farms beef, aged cheddar, lettuce, tomato, onion, scallion aioli, brioche bun, and fries.", "https://images.getbento.com/accounts/171bed38598ba1bdc6e5507cc27db6c9/media/FDBlplffRUGph3spaBOR_CIRCA%20-%20BORO%20-%20SPRING%202026%20-%20LUNCH.pdf"],
  ["replacement-circa-at-the-boro-tysons-va", "crispychickencobb", "Crispy Chicken Cobb", "Romaine, mixed greens, crispy chicken bites, applewood-smoked bacon, hard-boiled egg, blue cheese, marinated tomatoes, avocado, carrots, cucumbers, grilled corn, champagne vinaigrette, and smoked-blue-cheese dressing.", "https://images.getbento.com/accounts/171bed38598ba1bdc6e5507cc27db6c9/media/FDBlplffRUGph3spaBOR_CIRCA%20-%20BORO%20-%20SPRING%202026%20-%20LUNCH.pdf"],
  ["replacement-circa-at-the-boro-tysons-va", "dchotchickensandwich", "DC Hot Chicken Sandwich", "Mumbo sauce, house-made dill pickles, cider slaw, habanero aioli, brioche bun, and fries.", "https://images.getbento.com/accounts/171bed38598ba1bdc6e5507cc27db6c9/media/FDBlplffRUGph3spaBOR_CIRCA%20-%20BORO%20-%20SPRING%202026%20-%20LUNCH.pdf"],
  ["replacement-circa-at-the-boro-tysons-va", "grilledchickensandwich", "Grilled Chicken Sandwich", "Provolone, arugula, roasted peppers, basil aioli, ciabatta, and fries.", "https://images.getbento.com/accounts/171bed38598ba1bdc6e5507cc27db6c9/media/FDBlplffRUGph3spaBOR_CIRCA%20-%20BORO%20-%20SPRING%202026%20-%20LUNCH.pdf"],
  ["replacement-circa-at-the-boro-tysons-va", "mediterraneanbowl", "Mediterranean Bowl", "Crispy falafel, shredded romaine, pickled cucumbers, marinated tomatoes, pickled red onions, feta, tzatziki, hummus, garlic toum, roasted cauliflower, harissa vinaigrette, and warm pita bread.", "https://images.getbento.com/accounts/171bed38598ba1bdc6e5507cc27db6c9/media/FDBlplffRUGph3spaBOR_CIRCA%20-%20BORO%20-%20SPRING%202026%20-%20LUNCH.pdf"],
  ["replacement-circa-at-the-boro-tysons-va", "parmesanchickenbowl", "Parmesan Chicken Bowl", "Baby arugula, herbed pearl couscous, crispy chicken bites, marinated tomatoes, sun-dried-tomato vinaigrette, Parmesan crisp, and basil aioli.", "https://images.getbento.com/accounts/171bed38598ba1bdc6e5507cc27db6c9/media/FDBlplffRUGph3spaBOR_CIRCA%20-%20BORO%20-%20SPRING%202026%20-%20LUNCH.pdf"],
  ["replacement-circa-at-the-boro-tysons-va", "parmesankale", "Parmesan Kale", "Kale, toasted sunflower seeds, carrots, marinated tomatoes, crushed crostini, and Parmesan vinaigrette; optional chicken, grilled shrimp, or salmon.", "https://images.getbento.com/accounts/171bed38598ba1bdc6e5507cc27db6c9/media/PPWwknDdSBKnXs5h9ERX_CIRCA%20-%20BORO%20-%20SPRING%202026%20-%20DINNER.pdf"],
  ["replacement-circa-at-the-boro-tysons-va", "salmonsalad", "Salmon Salad", "Mixed greens, marinated tomatoes, peewee potatoes, balsamic onions, goat cheese, and champagne vinaigrette.", "https://images.getbento.com/accounts/171bed38598ba1bdc6e5507cc27db6c9/media/FDBlplffRUGph3spaBOR_CIRCA%20-%20BORO%20-%20SPRING%202026%20-%20LUNCH.pdf"],
  ["replacement-circa-at-the-boro-tysons-va", "sesamecrustedtuna", "Sesame-Crusted Tuna", "Mixed greens, romaine, edamame, red onion, shredded carrots, cucumbers, avocado, marinated tomatoes, jicama, herbs, crispy wontons, and creamy ginger dressing.", "https://images.getbento.com/accounts/171bed38598ba1bdc6e5507cc27db6c9/media/FDBlplffRUGph3spaBOR_CIRCA%20-%20BORO%20-%20SPRING%202026%20-%20LUNCH.pdf"],
  ["replacement-circa-at-the-boro-tysons-va", "shotgunshrimp", "Shotgun Shrimp", "Flash-fried shrimp with sweet chili sauce, red bell pepper, broccolini, jicama slaw, pickled jalapeños, and micro cilantro.", "https://images.getbento.com/accounts/171bed38598ba1bdc6e5507cc27db6c9/media/FDBlplffRUGph3spaBOR_CIRCA%20-%20BORO%20-%20SPRING%202026%20-%20LUNCH.pdf"],
  ["replacement-circa-at-the-boro-tysons-va", "steaksalad", "Steak Salad", "Seven-ounce grilled sirloin, mixed greens, marinated tomatoes, cucumbers, avocado, grilled corn, balsamic-grilled onions, blue cheese, and balsamic vinaigrette.", "https://images.getbento.com/accounts/171bed38598ba1bdc6e5507cc27db6c9/media/PPWwknDdSBKnXs5h9ERX_CIRCA%20-%20BORO%20-%20SPRING%202026%20-%20DINNER.pdf"],
  ["replacement-circa-at-the-boro-tysons-va", "thaishrimp", "Thai Shrimp", "Shotgun shrimp, mixed greens, Napa cabbage, carrots, cucumber, red onion, marinated tomatoes, crispy wontons, micro cilantro, and peanuts.", "https://images.getbento.com/accounts/171bed38598ba1bdc6e5507cc27db6c9/media/FDBlplffRUGph3spaBOR_CIRCA%20-%20BORO%20-%20SPRING%202026%20-%20LUNCH.pdf"],
  ["replacement-circa-at-the-boro-tysons-va", "tunapokenachos", "Tuna Poke Nachos", "Sesame-ginger marinade, wasabi-avocado cream, tobiko, pickled-ginger aioli, wonton chips, sweet soy glaze, roasted nori, and sesame seeds.", "https://images.getbento.com/accounts/171bed38598ba1bdc6e5507cc27db6c9/media/FDBlplffRUGph3spaBOR_CIRCA%20-%20BORO%20-%20SPRING%202026%20-%20LUNCH.pdf"],
  ["replacement-circa-at-the-boro-tysons-va", "turkeyburger", "Turkey Burger", "Provolone, lettuce, tomato, pickled onions, habanero aioli, brioche bun, and sweet-potato fries.", "https://images.getbento.com/accounts/171bed38598ba1bdc6e5507cc27db6c9/media/FDBlplffRUGph3spaBOR_CIRCA%20-%20BORO%20-%20SPRING%202026%20-%20LUNCH.pdf"],
  ["replacement-circa-at-the-boro-tysons-va", "wildmushroom", "Wild Mushroom", "Cremini, shiitake, portobello, and oyster mushrooms with arugula, pesto, truffle oil, and mozzarella.", "https://images.getbento.com/accounts/171bed38598ba1bdc6e5507cc27db6c9/media/FDBlplffRUGph3spaBOR_CIRCA%20-%20BORO%20-%20SPRING%202026%20-%20LUNCH.pdf"],
  ["evening-star-cafe-alexandria-va", "chopped-brisket-taco", "Chopped Brisket Taco", "House-made tallow tortilla with iceberg lettuce, pico de gallo, and smoked crema.", "https://www.eveningstarcafe.net/_files/ugd/ea7e5d_6caeafa11ed841a8a0e7c8ac762501c0.pdf"],
  ["evening-star-cafe-alexandria-va", "pulled-chicken-taco", "Pulled Chicken Taco", "House-made tallow tortilla with iceberg lettuce, pico de gallo, and smoked crema.", "https://www.eveningstarcafe.net/_files/ugd/ea7e5d_6caeafa11ed841a8a0e7c8ac762501c0.pdf"],
  ["evening-star-cafe-alexandria-va", "pulled-pork-taco", "Pulled Pork Taco", "House-made tallow tortilla with iceberg lettuce, pico de gallo, and smoked crema.", "https://www.eveningstarcafe.net/_files/ugd/ea7e5d_6caeafa11ed841a8a0e7c8ac762501c0.pdf"],
  ["evening-star-cafe-alexandria-va", "sliced-brisket-taco", "Sliced Brisket Taco", "House-made tallow tortilla with iceberg lettuce, pico de gallo, and smoked crema.", "https://www.eveningstarcafe.net/_files/ugd/ea7e5d_6caeafa11ed841a8a0e7c8ac762501c0.pdf"],
  ["evening-star-cafe-alexandria-va", "sliced-turkey-taco", "Sliced Turkey Taco", "House-made tallow tortilla with iceberg lettuce, pico de gallo, and smoked crema.", "https://www.eveningstarcafe.net/_files/ugd/ea7e5d_6caeafa11ed841a8a0e7c8ac762501c0.pdf"],
  ["evening-star-cafe-alexandria-va", "wedge-salad", "Wedge Salad", "Iceberg lettuce, applewood-smoked bacon, tomato, Gorgonzola, and ranch dressing.", "https://www.eveningstarcafe.net/_files/ugd/ea7e5d_c93a4354be174767b914f106f7df7ade.pdf"],
  ["replacement-masala-art-washington-dc", "rice-kheer", "Rice Kheer", "The famous rice pudding.", "https://www.masalaartdc.com/menu"],
];

const round31ReviewedDescriptionCandidates = [
  ["burtons-grill-and-bar-washington-dc-dc-metro", "classic-burger", "Classic Burger", "Allen Brothers Angus beef with lettuce, tomato, red onions, pickles, a choice of cheese, and a brioche bun, served with French fries.", "https://order.burtonsgrill.com/api/vendors/burtons-grill-riverdale"],
  ["burtons-grill-and-bar-washington-dc-dc-metro", "veggie-burger", "Veggie Burger", "House-recipe veggie burger with avocado, spinach, tomato, cheddar, lemon aioli, and a brioche bun, served with French fries.", "https://order.burtonsgrill.com/api/vendors/burtons-grill-riverdale"],
  ["burtons-grill-and-bar-washington-dc-dc-metro", "superfood", "Superfood", "Spinach, avocado, quinoa, grape tomatoes, julienned vegetables, feta, dried cranberries, and lemon vinaigrette.", "https://order.burtonsgrill.com/api/vendors/burtons-grill-riverdale"],
  ["burtons-grill-and-bar-washington-dc-dc-metro", "california-chicken-sandwich", "California Chicken Sandwich", "Bronzed chicken, Black Forest ham, guacamole, pepper jack, chipotle aioli, and a ciabatta roll, with a choice of side.", "https://order.burtonsgrill.com/api/vendors/burtons-grill-riverdale"],
  ["burtons-grill-and-bar-washington-dc-dc-metro", "crispy-fish-sandwich", "Crispy Fish Sandwich", "Fried haddock, pickled red onions, pickles, tartar sauce, and a brioche bun, with a choice of side.", "https://order.burtonsgrill.com/api/vendors/burtons-grill-riverdale"],
  ["burtons-grill-and-bar-washington-dc-dc-metro", "maxx-burger", "Maxx Burger", "Allen Brothers Angus beef with lettuce, tomato, pickles, onion strings, American cheese, special sauce, and a brioche bun, with a choice of side.", "https://order.burtonsgrill.com/api/vendors/burtons-grill-riverdale"],
  ["burtons-grill-and-bar-washington-dc-dc-metro", "gluten-free-california-chicken", "Gluten Free California Chicken", "Bronzed chicken, Black Forest ham, guacamole, pepper jack, chipotle aioli, and a gluten-free bun, with a choice of side.", "https://order.burtonsgrill.com/api/vendors/burtons-grill-riverdale"],
  ["burtons-grill-and-bar-washington-dc-dc-metro", "gluten-free-classic-cheeseburger", "Gluten Free Classic Cheeseburger", "Allen Brothers Angus beef with lettuce, tomato, red onions, pickles, a choice of cheese, and a gluten-free bun, with a choice of side.", "https://order.burtonsgrill.com/api/vendors/burtons-grill-riverdale"],
  ["burtons-grill-and-bar-washington-dc-dc-metro", "gluten-free-fish-sandwich", "Gluten Free Fish Sandwich", "Fried haddock, pickled red onions, pickles, tartar sauce, and a gluten-free bun, with a choice of side.", "https://order.burtonsgrill.com/api/vendors/burtons-grill-riverdale"],
  ["burtons-grill-and-bar-washington-dc-dc-metro", "gluten-free-maxx-burger", "Gluten Free Maxx Burger", "Allen Brothers Angus beef with lettuce, tomato, pickles, onion strings, a choice of cheese, special sauce, and a gluten-free bun, with a choice of side.", "https://order.burtonsgrill.com/api/vendors/burtons-grill-riverdale"],
  ["burtons-grill-and-bar-washington-dc-dc-metro", "gluten-free-veggie-burger", "Gluten Free Veggie Burger", "House-recipe veggie burger with avocado, spinach, tomato, a choice of cheese, lemon aioli, and a gluten-free bun, with a choice of side.", "https://order.burtonsgrill.com/api/vendors/burtons-grill-riverdale"],
  ["alatri-bros-bethesda-md", "avocado-and-healthy-grains", "Avocado & Healthy Grains", "Quinoa, tomato, parsley, onion, lemon, and arugula.", "https://www.alatribros.com/menu"],
  ["alatri-bros-bethesda-md", "picnic-platter", "Picnic Platter", "Deviled eggs, olives, Parmesan, soppressata, arugula-and-tomato salad, breadsticks, and garlic aioli.", "https://www.alatribros.com/menu"],
  ["alatri-bros-bethesda-md", "shrimp-parmesan", "Shrimp Parmesan", "Shrimp Parmesan served over fresh-made fettuccine.", "https://www.alatribros.com/menu"],
  ["alatri-bros-bethesda-md", "tomato-crostini", "Tomato Crostini", "Tomato, mozzarella, and basil.", "https://www.alatribros.com/menu"],
  ["osm-indaroma-11473331569", "aam-palak-chaat", "Aam Palak Chaat", "Crispy fried spinach with IndAroma chaat mix, diced mango, cilantro, sweet yogurt, mint, and tamarind sauces.", "https://indaroma.com/menus/menu.pdf"],
  ["osm-indaroma-11473331569", "chaat-papdi", "Chaat Papdi", "Papdi, potatoes, chickpeas, cilantro, yogurt, mint, and tamarind sauces.", "https://indaroma.com/menus/menu.pdf"],
  ["osm-indaroma-11473331569", "samosa-chaat", "Samosa Chaat", "Samosa, chickpea curry, onions, mint, spicy garlic, and tamarind sauce.", "https://indaroma.com/menus/menu.pdf"],
  ["replacement-bacchus-of-lebanon-bethesda-md", "bacchus-chicken-shawarma", "Chicken Shawarma", "Shaved marinated chicken breast grilled with spices and served with tahini.", "https://www.bacchusoflebanon.com/menu/"],
  ["replacement-bacchus-of-lebanon-bethesda-md", "bacchus-kibbe-bel-batata", "Kibbe Bel Batata", "Potato with cracked wheat, filled with vegetables, fried, and served with tahini.", "https://www.bacchusoflebanon.com/menu/"],
  ["replacement-bacchus-of-lebanon-bethesda-md", "bacchus-labneh", "Labneh", "Strained farmer's yogurt with olive oil and mint.", "https://www.bacchusoflebanon.com/menu/"],
  ["replacement-bacchus-of-lebanon-bethesda-md", "bacchus-maanek", "Maanek", "House-made grilled lamb sausage with pine nuts and coriander.", "https://www.bacchusoflebanon.com/menu/"],
  ["replacement-bacchus-of-lebanon-bethesda-md", "bacchus-salatet-bethenjan", "Salatet Bethenjan", "Eggplant tossed with Lebanese bread, garlic, salt, onions, pomegranate sauce, spices, parsley, and tomatoes.", "https://www.bacchusoflebanon.com/menu/"],
  ["replacement-bacchus-of-lebanon-bethesda-md", "bacchus-samki-harra", "Samki Harra", "Fresh grilled salmon served over basmati rice with spiced tomato sauce.", "https://www.bacchusoflebanon.com/menu/"],
  ["replacement-bacchus-of-lebanon-bethesda-md", "bacchus-vegetarian-sampler", "Vegetarian Sampler", "A selection of simmered vegetables served with grilled cauliflower and lentils.", "https://www.bacchusoflebanon.com/menu/"],
  ["makers-union-reston-va", "alfredo-pasta", "Alfredo Pasta", "Gruyère-Parmesan cream sauce with linguine and garlic bread; choice of chicken or shrimp.", "https://www.makersunionpub.com/s/MakersUnion-2026Menus-VA1-082626-Reston-Arlington.pdf"],
  ["replacement-apapacho-taqueria-washington-dc", "el-tacote", "El Tacote", "Flour tortilla with grilled New York strip steak, chicharrón, Chihuahua cheese, avocado purée, and pico de gallo.", "https://www.apapachotaqueria.com/app/store/api/v28/editor/users/149682741/sites/916428179789760537/products?page=1&per_page=200&include=images,media_files,discounts"],
  ["replacement-apapacho-taqueria-washington-dc", "tortilla-soup", "Tortilla Soup", "House-made tomato broth with avocado, tortilla strips, queso fresco, epazote, and chile pasilla.", "https://www.apapachotaqueria.com/app/store/api/v28/editor/users/149682741/sites/916428179789760537/products?page=1&per_page=200&include=images,media_files,discounts"],
  ["kathmandu-tapas-cocktails-dc", "instant-noodle-salad", "Instant Noodle Salad", "Wai Wai spice mix, diced red onion, lime juice, cucumber, and moong sprouts.", "https://www.kathmandu-dc.site/menu-experience"],
  ["kathmandu-tapas-cocktails-dc", "buff-sukuti", "Buff Sukuti", "Smoke-dried buffalo jerky, stir-fried vegetables, cumin, and red chili.", "https://www.kathmandu-dc.site/menu-experience"],
  ["kathmandu-tapas-cocktails-dc", "timur-calamari", "Timur Calamari", "Flash-fried squid with signature Sichuan dust, citrus zest, and spicy mayonnaise.", "https://www.kathmandu-dc.site/menu-experience"],
  ["kathmandu-tapas-cocktails-dc", "bhatmas-macha", "Bhatmas Macha", "Crispy dried fish, roasted soybeans, mustard oil, and crushed Akbare chili.", "https://www.kathmandu-dc.site/menu-experience"],
  ["kathmandu-tapas-cocktails-dc", "mustang-aloo", "Mustang Aloo", "Crispy potatoes with Himalayan herbs, timur-chili infusion, and Thakali chutney.", "https://www.kathmandu-dc.site/menu-experience"],
  ["kathmandu-tapas-cocktails-dc", "steamed-momo", "Steamed Mo:Mo", "Traditional Himalayan steamed dumplings served with tomato chutney; choice of chicken, vegan, or buffalo filling.", "https://www.kathmandu-dc.site/menu-experience"],
  ["kathmandu-tapas-cocktails-dc", "momo-poppers", "Mo:Mo Poppers", "Crispy bite-sized dumplings with tomato chutney and spicy mayonnaise; choice of chicken, vegan, or buffalo filling.", "https://www.kathmandu-dc.site/menu-experience"],
  ["kathmandu-tapas-cocktails-dc", "chilli-momo", "Chilli Mo:Mo", "Dumplings wok-tossed with fresh vegetables in a spicy, tangy sauce; choice of chicken, vegan, or buffalo filling.", "https://www.kathmandu-dc.site/menu-experience"],
  ["kathmandu-tapas-cocktails-dc", "12-spice-pakku", "12-Spice Pakku", "Slow-cooked bone-in dried goat meat served with savory rice crisps and radish pickle.", "https://www.kathmandu-dc.site/menu-experience"],
  ["kathmandu-tapas-cocktails-dc", "masala-crab-cake", "Masala Crab Cake", "Maryland crab, garam masala blend, and Thakali chutney.", "https://www.kathmandu-dc.site/menu-experience"],
  ["kathmandu-tapas-cocktails-dc", "lamb-chop", "Lamb Chop", "Tender lamb chops slow-marinated with Nepali spices and grilled.", "https://www.kathmandu-dc.site/menu-experience"],
  ["kathmandu-tapas-cocktails-dc", "mountain-sliders", "Mountain Sliders", "Water-buffalo patties with arugula and tomatoes.", "https://www.kathmandu-dc.site/menu-experience"],
  ["kathmandu-tapas-cocktails-dc", "kukhura-tareko", "Kukhura Tareko", "Battered chicken bites with egg white, ginger-garlic infusion, and Nepali herbs.", "https://www.kathmandu-dc.site/menu-experience"],
  ["kathmandu-tapas-cocktails-dc", "duck-choila-tacos", "Duck Choila Tacos", "Smoked duck breast, fresh lettuce, spiced-oil infusion, and Himalayan spices.", "https://www.kathmandu-dc.site/menu-experience"],
  ["kathmandu-tapas-cocktails-dc", "badel-sadheko", "Badel Sadheko", "Wild boar with ginger-garlic infusion, toasted Himalayan spices, and fenugreek oil.", "https://www.kathmandu-dc.site/menu-experience"],
  ["kathmandu-tapas-cocktails-dc", "paneer-steak", "Paneer Steak", "Seared cottage cheese with turmeric-yogurt marinade and mint reduction.", "https://www.kathmandu-dc.site/menu-experience"],
  ["kathmandu-tapas-cocktails-dc", "tandoori-soy-skewers", "Tandoori Soy Skewers", "Spiced soy, house masala, and charred aromatics.", "https://www.kathmandu-dc.site/menu-experience"],
  ["kathmandu-tapas-cocktails-dc", "jalebi-rabri", "Jalebi Rabri", "Crisp syrupy spirals with slow-reduced milk cream.", "https://www.kathmandu-dc.site/menu-experience"],
];

const round30ReviewedDescriptionCandidates = [
  ["osm-burger-shack-9421511261", "v-beyond-burger", "(V) Beyond Burger", "Plant-based and vegan.", "https://order.toasttab.com/online/the-burger-shack"],
  ["osm-burger-shack-9421511261", "v-portabella-cap-burger", "(V) Portabella Cap Burger", "Caramelized onion; vegan.", "https://order.toasttab.com/online/the-burger-shack"],
  ["osm-sala-thai-2812475004", "10:crab-rangoon", "Crab Rangoon", "Deep-fried wontons filled with cream cheese, crab meat, crab stick, and celery, served with sweet-and-sour sauce.", "https://salathaibethesda.com/menu"],
  ["osm-el-golfo-4957750893", "tapas-mixtas", "Tapas Mixtas", "Chicken, steak, chicharrón, yucca, shrimp, and ceviche mixto.", "https://www.elgolforestaurant.com/main-menu-2-2/"],
  ["osm-el-golfo-4957750893", "tapas-mixtas-gf", "Tapas Mixtas (GF)", "Chicken, steak, chicharrón, yucca, shrimp, and ceviche mixto.", "https://www.elgolforestaurant.com/main-menu-2-2/"],
  ["osm-el-golfo-4957750893", "salmon-in-pacifico-sauce", "Salmon in Pacifico Sauce", "Topped with a creamy garlic-and-caper sauce.", "https://www.elgolforestaurant.com/main-menu-2-2/"],
  ["osm-el-golfo-4957750893", "carne-asada-a-la-mexicana", "Carne Asada a la Mexicana", "Charcoal-grilled marinated skirt steak served with guacamole.", "https://www.elgolforestaurant.com/main-menu-2-2/"],
  ["osm-el-golfo-4957750893", "plato-norteno", "Plato Norteño", "Chicken burrito, cheese enchilada, and guacamole.", "https://www.elgolforestaurant.com/main-menu-2-2/"],
  ["osm-el-golfo-4957750893", "pechuguitas", "Pechuguitas", "Grilled chicken breast served with white rice and corn on the cob.", "https://www.elgolforestaurant.com/main-menu-2-2/"],
  ["osm-el-golfo-4957750893", "mojarra-la-union-gf", "Mojarra La Union (GF)", "Fresh whole rockfish, seasoned and pan-fried.", "https://www.elgolforestaurant.com/main-menu-2-2/"],
  ["osm-el-golfo-4957750893", "vegan-pupusa-platter", "Vegan Pupusa Platter", "Two squash-and-spinach pupusas served with curtido (pickled cabbage) and salsa de tomate.", "https://www.elgolforestaurant.com/main-menu-2-2/"],
  ["osm-el-golfo-4957750893", "vegetable-burrito", "Vegetable Burrito", "Topped with ranchera sauce and melted cheese.", "https://www.elgolforestaurant.com/main-menu-2-2/"],
  ["ser-restaurant-arlington-va", "bacalao", "Bacalao", "Salted cod, extra-virgin olive-oil emulsion, garlic, cayenne, bell peppers, and mushrooms.", "https://serrestaurant.com/menu/serrestaurant"],
  ["ser-restaurant-arlington-va", "blt", "BLT", "Brioche, bacon, lettuce, tomato, mayonnaise, and home fries.", "https://serrestaurant.com/menu/serrestaurant"],
  ["ser-restaurant-arlington-va", "large-seafood-platter", "Large Seafood Platter", "Twelve oysters, eight shrimp, jumbo lump crab, whole lobster, octopus salad, and ahi tuna tartare.", "https://serrestaurant.com/menu/serrestaurant"],
  ["j-hollingers-watermans-chophouse-silver-spring-md", "belgian-waffle-station", "BELGIAN WAFFLE STATION", "Fresh strawberries, salted caramel, fruit compote, whipped cream, chocolate sauce, and maple syrup.", "https://www.jhollingers.com/wp-content/uploads/JH-Brunch-Buffet-July26.pdf"],
  ["j-hollingers-watermans-chophouse-silver-spring-md", "boatmans-platter", "BOATMAN'S PLATTER", "Six oysters, six chilled jumbo shrimp, lobster tail, ceviche, horseradish crème, smoked cocktail sauce, mignonette, and lemon.", "https://www.jhollingers.com/wp-content/uploads/JHollingersDinnerMenu-June26-3.pdf"],
  ["j-hollingers-watermans-chophouse-silver-spring-md", "buttermilk-fried-oysters", "BUTTERMILK FRIED OYSTERS", "Served with tartar sauce and pickles.", "https://www.jhollingers.com/wp-content/uploads/JHollingersDinnerMenu-June26-3.pdf"],
  ["j-hollingers-watermans-chophouse-silver-spring-md", "ceviche", "CEVICHE", "Served with guacamole and plantain chips.", "https://www.jhollingers.com/wp-content/uploads/JHollingersDinnerMenu-June26-3.pdf"],
  ["j-hollingers-watermans-chophouse-silver-spring-md", "chophouse-burger", "CHOPHOUSE BURGER", "Black Angus beef burger with lettuce, tomato, onion, house pickles, chophouse sauce, a brioche bun, and house-cut fries.", "https://www.jhollingers.com/wp-content/uploads/JHollingersDinnerMenu-June26-3.pdf"],
  ["j-hollingers-watermans-chophouse-silver-spring-md", "hollingers-watermans-stew", "HOLLINGER’S WATERMAN'S STEW", "Fish, clams, shrimp, mussels, calamari, potatoes, and spinach in a red fisherman's broth, served with crostini.", "https://www.jhollingers.com/wp-content/uploads/JHollingersDinnerMenu-June26-3.pdf"],
  ["j-hollingers-watermans-chophouse-silver-spring-md", "steak-satay", "STEAK SATAY", "Served with chimichurri sauce.", "https://www.jhollingers.com/wp-content/uploads/JHollingersDinnerMenu-June26-3.pdf"],
  ["georges-steak-n-things-fairfax-station-va", "bbq-chicken-or-pork8", "BBQ Chicken or Pork 8-inch", "Pulled barbecue chicken or pork with cheese.", "https://georgessteaknthings.com/"],
  ["georges-steak-n-things-fairfax-station-va", "caesarsmall", "Caesar Small", "Romaine lettuce, croutons, and Parmesan cheese.", "https://georgessteaknthings.com/"],
  ["georges-steak-n-things-fairfax-station-va", "cajun-steak-and-cheese8", "Cajun Steak & Cheese 8-inch", "Porterhouse steak, sliced and grilled with Cajun spices.", "https://georgessteaknthings.com/"],
  ["georges-steak-n-things-fairfax-station-va", "tunareg", "Tuna Regular", "House-made tuna salad.", "https://georgessteaknthings.com/"],
  ["georges-steak-n-things-fairfax-station-va", "turkeyreg", "Turkey Regular", "Thinly sliced turkey breast.", "https://georgessteaknthings.com/"],
  ["georges-steak-n-things-fairfax-station-va", "vegetarian8", "Vegetarian 8-inch", "Cheese with a choice of vegetables.", "https://georgessteaknthings.com/"],
  ["replacement-ruan-thai-restaurant-wheaton-md", "19-garden-salad", "19. GARDEN SALAD", "Iceberg lettuce, cucumber, tomato, bell pepper, cabbage, and carrot, served with house-made creamy lime dressing.", "https://ruanthaiwheaton.com/wp-content/uploads/2022/02/RuanThai-Restaurant-Menu.pdf"],
  ["replacement-ruan-thai-restaurant-wheaton-md", "20-ruan-thai-house-salad", "20. RUAN THAI HOUSE SALAD", "Iceberg lettuce, cucumber, tomato, bell pepper, cabbage, carrot, egg, and tofu, served with peanut sauce.", "https://ruanthaiwheaton.com/wp-content/uploads/2022/02/RuanThai-Restaurant-Menu.pdf"],
  ["replacement-ruan-thai-restaurant-wheaton-md", "27pad-pak", "27. PAD PAK", "Choice of meat sautéed with broccoli, cauliflower, snow peas, baby corn, carrot, mushrooms, and cabbage in brown garlic sauce.", "https://ruanthaiwheaton.com/wp-content/uploads/2022/02/RuanThai-Restaurant-Menu.pdf"],
  ["replacement-ruan-thai-restaurant-wheaton-md", "33-pad-talay", "33. PAD TALAY", "Stir-fried shrimp and squid with ginger, baby corn, snow peas, mushrooms, carrot, and brown sauce.", "https://ruanthaiwheaton.com/wp-content/uploads/2022/02/RuanThai-Restaurant-Menu.pdf"],
  ["replacement-ruan-thai-restaurant-wheaton-md", "39-pad-woon-sen", "39. PAD WOON SEN", "Stir-fried bean-thread noodles with spring onion, baby corn, mushrooms, snow peas, carrot, and egg; choice of chicken, vegetables, tofu, beef, pork, shrimp, or squid.", "https://ruanthaiwheaton.com/wp-content/uploads/2022/02/RuanThai-Restaurant-Menu.pdf"],
  ["replacement-ruan-thai-restaurant-wheaton-md", "49-pineapple-fried-rice", "49. PINEAPPLE FRIED RICE", "Chef's special fried rice with a choice of meat, egg, pineapple, cashew nuts, onion, peas, carrot, and raisins.", "https://ruanthaiwheaton.com/wp-content/uploads/2022/02/RuanThai-Restaurant-Menu.pdf"],
  ["replacement-ruan-thai-restaurant-wheaton-md", "69-grilled-salmon", "69. GRILLED SALMON", "Choice of hot chili, garlic, and basil; three-flavor sauce with red onion, chili, garlic, and tamarind; or black-bean sauce with ginger, mushrooms, celery, snow peas, baby corn, and carrot.", "https://ruanthaiwheaton.com/wp-content/uploads/2022/02/RuanThai-Restaurant-Menu.pdf"],
  ["ometeo-tysons-va", "aves-con-todo-fajita-chicken", "Aves Con Todo Fajita (Chicken)", "Poultry trio of grilled chicken breast, duck carnitas, and chicken thigh, served with onions, poblanos, grilled jalapeño, nopales, Chihuahua cheese, salsa frita, crema, arroz rojo, refried beans containing pork, and house-made heirloom corn and flour tortillas.", "https://order.toasttab.com/online/ometeo-1640-capitol-one-drive"],
  ["ometeo-tysons-va", "aves-fajita-chicken", "Aves Fajita (Chicken)", "Grilled chicken breast served with onions, poblanos, grilled jalapeño, nopales, Chihuahua cheese, salsa frita, crema, arroz rojo, refried beans containing pork, and house-made heirloom corn and flour tortillas.", "https://order.toasttab.com/online/ometeo-1640-capitol-one-drive"],
  ["ometeo-tysons-va", "cerdo-con-todo-fajita-pork", "Cerdo Con Todo Fajita (Pork)", "Pork trio of braised pork-shoulder carnitas, jalapeño-cheddar chorizo, and smoked spare ribs, served with onions, poblanos, grilled jalapeño, nopales, Chihuahua cheese, salsa frita, crema, arroz rojo, refried beans containing pork, and house-made heirloom corn and flour tortillas.", "https://order.toasttab.com/online/ometeo-1640-capitol-one-drive"],
  ["ometeo-tysons-va", "de-res-con-todo-fajita-beef", "De Res Con Todo Fajita (Beef)", "Beef trio of grilled skirt steak, bone-in short rib, and suadero (beef belly), served with onions, poblanos, grilled jalapeño, nopales, Chihuahua cheese, salsa frita, crema, arroz rojo, refried beans containing pork, and house-made heirloom corn and flour tortillas.", "https://order.toasttab.com/online/ometeo-1640-capitol-one-drive"],
  ["ometeo-tysons-va", "mar-fajita-shrimp", "Mar Fajita (Shrimp)", "Seared shrimp served with onions, poblanos, grilled jalapeño, nopales, Chihuahua cheese, salsa frita, crema, arroz rojo, refried beans containing pork, and house-made heirloom corn and flour tortillas.", "https://order.toasttab.com/online/ometeo-1640-capitol-one-drive"],
  ["ometeo-tysons-va", "tex-mex-burger", "Tex Mex Burger", "Two four-ounce patties with caramelized onions, pepper jack cheese, Tex-Mex Thousand Island dressing, dill pickles, jalapeño pickles, tomato, iceberg lettuce, and fries.", "https://order.toasttab.com/online/ometeo-1640-capitol-one-drive"],
];

const round29ReviewedDescriptionCandidates = [
  ["osm-ted-s-montana-2414839960", "balsamic-blue-steak", "Balsamic Blue Steak", "Sirloin, iceberg, romaine, organic spring mix, cucumber, blue cheese, bacon, vine-ripened tomato, balsamic reduction, and onion straws; choice of beef or bison.", "https://www.tedsmontanagrill.com/menu-salads.html"],
  ["osm-ted-s-montana-2414839960", "chicken-chopped", "Chicken Chopped", "Iceberg, grilled chicken, roasted corn, garbanzo beans, vine-ripened tomato, green pepper, red onion, fresh basil, cucumber, bacon, and fresh basil vinaigrette.", "https://www.tedsmontanagrill.com/menu-salads.html"],
  ["osm-ted-s-montana-2414839960", "knife-and-fork-chili-cheese", "Knife-and-fork Chili Cheese", "Pepper jack, cheddar, bison chili, tomato, jalapeño, red onion, sour cream, and ciabatta; choice of beef or bison.", "https://www.tedsmontanagrill.com/menu-burgers.html"],
  ["osm-ted-s-montana-2414839960", "absolute-best-fish-sandwich", "Absolute Best Fish Sandwich", "Lightly breaded cod, lettuce, chive-caper tartar sauce, cracked-wheat bun, kale salad, and fresh-cut fries.", "https://www.tedsmontanagrill.com/menu-seafood.html"],
  ["osm-ted-s-montana-2414839960", "big-sky-grilled", "Big Sky Grilled", "Iceberg, romaine, organic spring mix, bacon, cheddar, egg, vine-ripened tomato, avocado, and croutons; choice of beef burger, grilled chicken, bison burger, or cedar-plank salmon.", "https://www.tedsmontanagrill.com/menu-salads.html"],
  ["osm-ted-s-montana-2414839960", "bison-meatloaf", "Bison Meatloaf", "Served with gravy, garlic mashed potatoes, and buttered carrots.", "https://www.tedsmontanagrill.com/menu-bison.html"],
  ["osm-ted-s-montana-2414839960", "green-and-hot-sandwich", "Green and Hot Sandwich", "All-natural grilled chicken breast, pepper jack, grilled jalapeño, guacamole, Sriracha aioli, and fresh-cut fries.", "https://www.tedsmontanagrill.com/menu-poultry.html"],
  ["osm-ted-s-montana-2414839960", "salt-and-pepper-onion-rings", "Salt & Pepper Onion Rings", "Hand-breaded onion rings with horseradish sauce.", "https://www.tedsmontanagrill.com/menu-starters.html"],
  ["osm-bai-khao-thai-3763902064", "food-vegetable-dumplings", "Vegetable Dumplings", "Deep-fried vegetable dumplings.", "https://www.baikaothai.com/menu"],
  ["osm-blue-ocean-japanese-6281378373", "iidako-karaage", "Iidako Karaage", "Fried baby octopus.", "https://www.izakayablueocean.org/"],
  ["osm-blue-ocean-japanese-6281378373", "oshinko", "Oshinko", "Assorted pickled vegetables.", "https://www.izakayablueocean.org/"],
  ["osm-blue-ocean-japanese-6281378373", "okonomiyaki", "Okonomiyaki", "Shrimp, pork, squid, and cabbage mixed in batter, pan-fried, and topped with bonito flakes, ginger, mayonnaise, and okonomiyaki sauce; reservation required one day in advance.", "https://www.izakayablueocean.org/"],
  ["osm-blue-ocean-japanese-6281378373", "chicken-dark-meat", "Chicken dark meat", "Choice of teriyaki or shioyaki preparation.", "https://www.izakayablueocean.org/"],
  ["osm-blue-ocean-japanese-6281378373", "spicy-chicken-dark-meat", "Spicy Chicken dark meat", "Choice of teriyaki or shioyaki preparation.", "https://www.izakayablueocean.org/"],
  ["osm-blue-ocean-japanese-6281378373", "combo-set-served-with-rice", "Combo Set (served with rice)", "Choose two: beef, chicken, or salmon teriyaki; shrimp-and-vegetable tempura; or sushi with salmon, tuna, shrimp, white-fish nigiri, and a California roll.", "https://www.blueoceanizakaya.com/menu"],
  ["osm-blue-ocean-japanese-6281378373", "ocean-box", "Ocean Box", "Six pieces of nigiri sushi, three California-roll pieces, three tuna-roll pieces, shrimp-and-vegetable tempura, a choice of beef, chicken, or salmon teriyaki, fruit, and one scoop of ice cream.", "https://www.blueoceanizakaya.com/menu"],
  ["pizzeria-paradiso-hyattsville-md", "antipasti-choose-three", "ANTIPASTI (choose three)", "Choose from roasted vegetables (artichokes, broccoli rabe, eggplant, or escarole), cured meats (mortadella, prosciutto di Parma, salami, or spicy capocollo), or cheeses (buffalo mozzarella, Gorgonzola, goat cheese, or Pecorino).", "https://www.eatyourpizza.com/lunch-dinner"],
  ["replacement-roscoe-s-pizzeria-takoma-park-md", "egg-and-cheese-croissant", "EGG AND CHEESE CROISSANT", "Scrambled eggs and fontina cheese, served with rosemary potatoes; add Italian ham, sausage, spinach, or mushrooms.", "https://roscoespizzeria.com/brunch-menu"],
];

const round28ReviewedDescriptionCandidates = [
  ["popup-bagels-georgetown-dc", "3-bagels-schmear", "3-Bagels + Schmear", "Choose any three fresh-baked bagels with your choice of one schmear.", "https://popupbagels.lunchbox.io/api/v2/stores/00038/menus"],
  ["popup-bagels-georgetown-dc", "6-bagels-schmear", "6-Bagels + Schmear", "Choose any six fresh-baked bagels with your choice of one schmear.", "https://popupbagels.lunchbox.io/api/v2/stores/00038/menus"],
  ["popup-bagels-georgetown-dc", "12-bagels-2-schmears", "12-Bagels + 2 Schmears", "Choose any twelve fresh-baked bagels with your choice of two schmears.", "https://popupbagels.lunchbox.io/api/v2/stores/00038/menus"],
  ["popup-bagels-georgetown-dc", "30-bagels-5-schmears", "30-Bagels + 5 Schmears", "Includes 30 plain bagels with a choice of up to five schmears.", "https://popupbagels.lunchbox.io/api/v2/stores/00038/menus"],
  ["stoneys-dc", "bacon-cheeseburger", "Bacon Cheeseburger", "Bacon, lettuce, and tomato.", "https://stoneysonp.com/washington-logan-circle-stoney-s-food-menu"],
  ["stoneys-dc", "cajun-cheddar", "Cajun Cheddar", "Cajun seasoning, chipotle mayo, bacon, cheddar cheese, lettuce, and tomato.", "https://stoneysonp.com/washington-logan-circle-stoney-s-food-menu"],
  ["stoneys-dc", "chicken-quesadilla", "Chicken Quesadilla", "Peppers, cilantro, onions, cheese, pico de gallo, jalapeño, and sour cream.", "https://stoneysonp.com/washington-logan-circle-stoney-s-food-menu"],
  ["stoneys-dc", "cuban", "Cuban", "Roasted pork, ham, Swiss cheese, pickle, mustard, and fries.", "https://stoneysonp.com/washington-logan-circle-stoney-s-food-menu"],
  ["stoneys-dc", "hamburger", "Hamburger", "Lettuce and tomato.", "https://stoneysonp.com/washington-logan-circle-stoney-s-food-menu"],
  ["stoneys-dc", "salmon-blt", "Salmon BLT", "Bacon, lettuce, tomato, and lemon-dill mayo on multigrain bread, with fries.", "https://stoneysonp.com/washington-logan-circle-stoney-s-food-menu"],
  ["stoneys-dc", "thunderbird", "Thunderbird", "Turkey, gouda, bacon, pepperoncini relish, and chipotle mayo on sourdough.", "https://stoneysonp.com/washington-logan-circle-stoney-s-food-menu"],
  ["inca-social-vienna-va-dc-metro", "current:chaufa-amazonico", "CHAUFA AMAZONICO", "Wok-fried rice with chicken, smoked pork, Amazonian chorizo, sweet plantain, red pepper, green onions, bean sprouts, and eggs.", "https://incasocial.com/"],
  ["inca-social-vienna-va-dc-metro", "current:inca-burger", "INCA BURGER", "Eight-ounce patty with mozzarella, avocado, tomato, onions, and lettuce.", "https://incasocial.com/"],
  ["inca-social-vienna-va-dc-metro", "current:ceviche-tropical", "CEVICHE TROPICAL", "Shrimp, mango, avocado, sweet potato, passion-fruit leche de tigre, aji limo, cilantro, and shredded coconut.", "https://incasocial.com/"],
  ["inca-social-vienna-va-dc-metro", "current:pescado-a-lo-macho", "PESCADO A LO MACHO", "Pan-seared fish of the day topped with calamari, shrimp, mussels, octopus, onions, seafood sauce, and heavy cream, served with white rice.", "https://incasocial.com/"],
  ["inca-social-vienna-va-dc-metro", "current:spicy-tumi-chicken", "SPICY TUMI CHICKEN", "Fried chicken breast tossed in rocoto buffalo sauce with mozzarella, tomato, avocado, lettuce, and onions.", "https://incasocial.com/"],
  ["inca-social-vienna-va-dc-metro", "current:miraflores-roll", "MIRAFLORES ROLL", "Surimi, avocado, and smoked salmon topped with passion-fruit sauce, avocado, radish, shredded coconut, and aji amarillo seasoning.", "https://incasocial.com/"],
  ["inca-social-vienna-va-dc-metro", "current:pacifico-roll", "PACIFICO ROLL", "Surimi, avocado, and smoked salmon topped with surimi tartar, seaweed, rocoto aioli, and aji amarillo seasoning.", "https://incasocial.com/"],
  ["la-grande-boucherie-dc-washington-dc-dc-metro", "omelette-au-choix", "OMELETTE AU CHOIX", "Choice of ham and Gruyère or mushroom and Gruyère.", "https://www.boucherieus.com/la-grande-boucherie-dc-menu/"],
  ["osm-colline-13121610585", "bistro-burger", "BISTRO BURGER", "Two patties with club sauce, lettuce, American cheese, pickles, and frites.", "https://www.barcolline.com/"],
  ["osm-colline-13121610585", "tartine", "TARTINE", "Smoked salmon, country toast, herbed Boursin, poached egg, capers, and pickled shallots.", "https://www.barcolline.com/"],
  ["osm-colline-13121610585", "moules-frites", "MOULES FRITES", "Steamed mussels with fennel, pastis, cream, tarragon, and frites.", "https://www.barcolline.com/"],
  ["osm-colline-13121610585", "yellowfin-tuna", "YELLOWFIN TUNA", "Fingerling potatoes, white beans, French beans, piquillo pepper, egg, and tapenade niçoise.", "https://www.barcolline.com/"],
  ["carusos-grocery-pike-and-rose-md", "tricolore-salad", "TRICOLORE SALAD", "Endive, radicchio, arugula, sliced orange, olives, pistachios, toasted fennel, and citrus vinaigrette.", "https://www.carusosgrocery.com/_files/ugd/ea7e5d_81b00ddfb85440dab8a0aac996546ae7.pdf"],
  ["carusos-grocery-pike-and-rose-md", "truffled-mushroom-omelet", "TRUFFLED MUSHROOM OMELET", "Served with Parmesan potatoes and salad.", "https://www.carusosgrocery.com/_files/ugd/ea7e5d_81b00ddfb85440dab8a0aac996546ae7.pdf"],
  ["naja-mediterranean-mosaic-fairfax-va", "fresh-beet-salad", "Fresh Beet Salad", "Spinach, arugula, beet, green apple, walnut, goat cheese, and crispy onion.", "https://najamediterranean.com/menu"],
  ["naja-mediterranean-mosaic-fairfax-va", "hummus", "Hummus", "Chickpea, tahini, and lemon.", "https://najamediterranean.com/menu"],
  ["replacement-marley-s-bar-and-grill-hyattsville-md", "impossible-burger", "IMPOSSIBLE BURGER", "Lettuce, tomato, onions, pickles, spicy aioli, and a brioche bun.", "https://marleysbarandgrill.com/wp-content/uploads/2026/02/Marley_s_Kids_Menu.pdf"],
];

const round27ReviewedDescriptionCandidates = [
  ["jinya-ramen-dc", "spicy-creamy-v-ramen", "Spicy Creamy V Ramen", "Vegetable broth with tofu, onion, green onion, spinach, crispy onion, garlic chips, garlic oil, chili oil, and sesame seeds; served with thick noodles.", "https://www.jinyaramenbar.com/menu/dc/washington-dc/"],
  ["osm-la-ong-thai-3367109720", "pineapple-fried-rice", "Pineapple Fried Rice", "Shrimp, chicken, cashew nut, raisin, egg, tomato, and scallion.", "https://laongthai.com/menu.pdf"],
  ["osm-la-ong-thai-3367109720", "thai-vegetables-summer-rolls2", "Thai Vegetables Summer Rolls(2)", "Rice paper wrapped around tofu, lettuce, carrot, bean sprout, cucumber, and green onion.", "https://laongthai.com/menu.pdf"],
  ["osm-lamoon-thai-13607444769", "garden-roll", "Garden Roll", "Fresh lettuce, bell pepper, spring onion, tofu, thin rice noodle, and Thai basil wrapped in rice paper and served with tamarind peanut sauce.", "https://lamoonthaimd.com/menu/?menu=lamoon-thai"],
  ["osm-lamoon-thai-13607444769", "lamoon-pineapple-fried-rice", "Lamoon Pineapple Fried Rice", "Chef's special fried rice with chicken, shrimp, pineapple, cashew nuts, onion, scallion, tomato, and raisins.", "https://lamoonthaimd.com/menu/?menu=lamoon-thai"],
  ["osm-lamoon-thai-13607444769", "tom-yum-noodle-soup", "Tom Yum Noodle Soup", "Ground chicken or pork, peanut, and bean sprout in hot-and-sour broth with scallion, cilantro, garlic, and crispy wonton flakes; choice of thin, flat, or egg noodles.", "https://lamoonthaimd.com/menu/?menu=lamoon-thai"],
  ["little-beast-dc", "6-mile", "6 MILE", "Brick cheese blend, salami, pepperoni, pickled jalapeños, tomato sauce, and spicy honey.", "https://static1.squarespace.com/static/6140a8f0e23d8c5f9178c350/t/69c297b7ea7fb5734f0d7c3b/1774360503171/Spring-Summer+2026+LB+Chevy+Chase.pdf"],
  ["little-beast-dc", "beasty-boy", "BEASTY BOY", "Whole-milk mozzarella, fresh tomato sauce, sausage, mushroom, green pepper, and red onion.", "https://static1.squarespace.com/static/6140a8f0e23d8c5f9178c350/t/69a887e78b07a944342b8912/1772652519296/Palisades+Working.pdf"],
  ["little-beast-dc", "beet-salad", "BEET SALAD", "Arugula, microgreens, roasted beets, oranges, goat cheese, cider dressing, and candied pecans.", "https://static1.squarespace.com/static/6140a8f0e23d8c5f9178c350/t/69a887e78b07a944342b8912/1772652519296/Palisades+Working.pdf"],
  ["little-beast-dc", "charred-zucchini", "Charred Zucchini", "Olive oil, chilis, garlic yogurt, fresh dill, parmesan, and lemon.", "https://static1.squarespace.com/static/6140a8f0e23d8c5f9178c350/t/69c297b7ea7fb5734f0d7c3b/1774360503171/Spring-Summer+2026+LB+Chevy+Chase.pdf"],
  ["little-beast-dc", "dearborn-heights", "DEARBORN HEIGHTS", "Brick cheese blend, Roma tomatoes, parmesan, parsley, oregano, pesto, fresh basil, and pine nuts.", "https://static1.squarespace.com/static/6140a8f0e23d8c5f9178c350/t/69c297b7ea7fb5734f0d7c3b/1774360503171/Spring-Summer+2026+LB+Chevy+Chase.pdf"],
  ["little-beast-dc", "diavola", "DIAVOLA", "Spicy tomato sauce, signature cheese blend, garlic confit, salami, pepperoni, and banana peppers.", "https://static1.squarespace.com/static/6140a8f0e23d8c5f9178c350/t/69c297b7ea7fb5734f0d7c3b/1774360503171/Spring-Summer+2026+LB+Chevy+Chase.pdf"],
  ["little-beast-dc", "greenfield-village", "GREENFIELD VILLAGE", "Brick cheese blend, ricotta, green peppers, mushrooms, artichokes, spinach, black olives, and tomato sauce.", "https://static1.squarespace.com/static/6140a8f0e23d8c5f9178c350/t/69c297b7ea7fb5734f0d7c3b/1774360503171/Spring-Summer+2026+LB+Chevy+Chase.pdf"],
  ["little-beast-dc", "housemade-meatballs", "HOUSEMADE MEATBALLS", "Four beef meatballs with signature tomato sauce, whipped ricotta, parmesan, basil, and griddled focaccia.", "https://static1.squarespace.com/static/6140a8f0e23d8c5f9178c350/t/69a887e78b07a944342b8912/1772652519296/Palisades+Working.pdf"],
  ["little-beast-dc", "little-beast-salad", "LITTLE BEAST SALAD", "Lolla rosa lettuce, tomatoes, cucumbers, shredded carrots, crispy onions, pepperoncini, and white balsamic dressing.", "https://static1.squarespace.com/static/6140a8f0e23d8c5f9178c350/t/69c297b7ea7fb5734f0d7c3b/1774360503171/Spring-Summer+2026+LB+Chevy+Chase.pdf"],
  ["little-beast-dc", "motown", "MOTOWN", "Brick cheese blend, chili relish, pepperoni, caramelized onions, meatballs, roasted red peppers, banana peppers, and tomato sauce.", "https://static1.squarespace.com/static/6140a8f0e23d8c5f9178c350/t/69c297b7ea7fb5734f0d7c3b/1774360503171/Spring-Summer+2026+LB+Chevy+Chase.pdf"],
  ["little-beast-dc", "piggy-boy", "PIGGY BOY", "Whole-milk mozzarella, fresh tomato sauce, garlic, caramelized onion, bacon, ham, and meatballs.", "https://static1.squarespace.com/static/6140a8f0e23d8c5f9178c350/t/69a887e78b07a944342b8912/1772652519296/Palisades+Working.pdf"],
  ["little-beast-dc", "sausage", "SAUSAGE", "Tomato sauce, signature cheese blend, Italian sausage, caramelized onions, roasted red peppers, ricotta, and chili relish.", "https://static1.squarespace.com/static/6140a8f0e23d8c5f9178c350/t/69c297b7ea7fb5734f0d7c3b/1774360503171/Spring-Summer+2026+LB+Chevy+Chase.pdf"],
  ["little-beast-dc", "spicy-boy", "SPICY BOY", "Whole-milk mozzarella, fresh tomato sauce, salami, pepperoni, pickled jalapeños, and hot honey.", "https://static1.squarespace.com/static/6140a8f0e23d8c5f9178c350/t/69a887e78b07a944342b8912/1772652519296/Palisades+Working.pdf"],
  ["little-beast-dc", "the-joe-louis", "THE JOE LOUIS", "Brick cheese blend, ricotta, parmesan, sausage, pepperoni, green peppers, red onions, black olives, mushrooms, oregano, Aleppo pepper, and tomato sauce.", "https://static1.squarespace.com/static/6140a8f0e23d8c5f9178c350/t/69c297b7ea7fb5734f0d7c3b/1774360503171/Spring-Summer+2026+LB+Chevy+Chase.pdf"],
  ["little-beast-dc", "the-works", "THE WORKS", "Tomato sauce, signature cheese blend, sausage, pepperoni, bacon, caramelized onions, green peppers, black olives, and mushrooms.", "https://static1.squarespace.com/static/6140a8f0e23d8c5f9178c350/t/69c297b7ea7fb5734f0d7c3b/1774360503171/Spring-Summer+2026+LB+Chevy+Chase.pdf"],
  ["little-beast-dc", "veggie", "VEGGIE", "Tomato sauce, signature cheese blend, spinach, mushrooms, roasted red peppers, and caper tapenade.", "https://static1.squarespace.com/static/6140a8f0e23d8c5f9178c350/t/69c297b7ea7fb5734f0d7c3b/1774360503171/Spring-Summer+2026+LB+Chevy+Chase.pdf"],
  ["little-beast-dc", "watermelon-salad", "WATERMELON SALAD", "Fresh corn, shallots, avocado, tomatoes, roasted jalapeño ranch, cotija, micro cilantro, and crispy tortilla strips.", "https://static1.squarespace.com/static/6140a8f0e23d8c5f9178c350/t/69c297b7ea7fb5734f0d7c3b/1774360503171/Spring-Summer+2026+LB+Chevy+Chase.pdf"],
  ["little-beast-dc", "whipped-ricotta", "Whipped Ricotta", "Olive oil, honey, rosemary, hazelnuts, flaky salt, and wood-fired flatbread.", "https://static1.squarespace.com/static/6140a8f0e23d8c5f9178c350/t/69c297b7ea7fb5734f0d7c3b/1774360503171/Spring-Summer+2026+LB+Chevy+Chase.pdf"],
  ["replacement-bar-chinois-dc-washington-dc", "gyoza-de-boeuf", "Gyoza De Boeuf", "Three French onion beef gyoza with Gruyere, Swiss cheese, toasted garlic panko, sesame, cilantro aioli, and pickled onions.", "https://order.toasttab.com/online/barchinoisdc"],
  ["replacement-bar-chinois-dc-washington-dc", "steamed-shumai", "Steamed Shumai", "Four chicken-and-shrimp dumplings with water chestnut, fried garlic, scallions, soy sauce, and ginger.", "https://order.toasttab.com/online/barchinoisdc"],
  ["replacement-bar-chinois-dc-washington-dc", "popiah-de-canard", "Popiah de Canard", "Crispy fried duck spring rolls with cabbage, scallion, carrot, onion, and apricot sauce.", "https://order.toasttab.com/online/barchinoisdc"],
  ["replacement-bar-chinois-dc-washington-dc", "lu-rao-fan", "Lu Rao Fan", "Slow-braised five-spice pork belly on white rice with soy egg, scallions, ginger, arugula and pickled-onion salad, vinaigrette, and toasted sesame.", "https://order.toasttab.com/online/barchinoisdc"],
];

const reviewedSourceBackedDescriptionCandidates = new Map([
  ...round53ReviewedDescriptionCandidates.map(
    ([restaurantId, itemId, itemName, description, source]) => [targetKey(restaurantId, itemId), { description, itemName, sourceType: "reviewed-official-menu-description", sources: [source] }],
  ),
  ...round52ReviewedDescriptionCandidates.map(
    ([restaurantId, itemId, itemName, description, source]) => [targetKey(restaurantId, itemId), { description, itemName, sourceType: "reviewed-official-menu-description", sources: [source] }],
  ),
  ...round50ReviewedDescriptionCandidates.map(
    ([restaurantId, itemId, itemName, description, source]) => [targetKey(restaurantId, itemId), { description, itemName, sourceType: "reviewed-official-menu-description", sources: [source] }],
  ),
  ...round49ReviewedDescriptionCandidates.map(
    ([restaurantId, itemId, itemName, description, source]) => [targetKey(restaurantId, itemId), { description, itemName, sourceType: "reviewed-official-menu-description", sources: [source] }],
  ),
  ...round48ReviewedDescriptionCandidates.map(
    ([restaurantId, itemId, itemName, description, source]) => [targetKey(restaurantId, itemId), { description, itemName, sourceType: "reviewed-official-menu-description", sources: [source] }],
  ),
  ...round47ReviewedDescriptionCandidates.map(
    ([restaurantId, itemId, itemName, description, source]) => [targetKey(restaurantId, itemId), { description, itemName, sourceType: "reviewed-official-menu-description", sources: [source] }],
  ),
  ...round46ReviewedDescriptionCandidates.map(
    ([restaurantId, itemId, itemName, description, source]) => [targetKey(restaurantId, itemId), { description, itemName, sourceType: "reviewed-official-menu-description", sources: [source] }],
  ),
  ...round45ReviewedDescriptionCandidates.map(
    ([restaurantId, itemId, itemName, description, source]) => [targetKey(restaurantId, itemId), { description, itemName, sourceType: "reviewed-official-menu-description", sources: [source] }],
  ),
  ...round44ReviewedDescriptionCandidates.map(
    ([restaurantId, itemId, itemName, description, source]) => [targetKey(restaurantId, itemId), { description, itemName, sourceType: "reviewed-official-menu-description", sources: [source] }],
  ),
  ...round43ReviewedDescriptionCandidates.map(
    ([restaurantId, itemId, itemName, description, source]) => [targetKey(restaurantId, itemId), { description, itemName, sourceType: "reviewed-official-menu-description", sources: [source] }],
  ),
  ...round42ReviewedDescriptionCandidates.map(
    ([restaurantId, itemId, itemName, description, source]) => [targetKey(restaurantId, itemId), { description, itemName, sourceType: "reviewed-official-menu-description", sources: [source] }],
  ),
  ...round41ReviewedDescriptionCandidates.map(
    ([restaurantId, itemId, itemName, description, source]) => [targetKey(restaurantId, itemId), { description, itemName, sourceType: "reviewed-official-menu-description", sources: [source] }],
  ),
  ...round40ReviewedDescriptionCandidates.map(
    ([restaurantId, itemId, itemName, description, source]) => [
      targetKey(restaurantId, itemId),
      { description, itemName, sourceType: "reviewed-official-menu-description", sources: [source] },
    ],
  ),
  ...round39ReviewedDescriptionCandidates.map(
    ([restaurantId, itemId, itemName, description, source]) => [
      targetKey(restaurantId, itemId),
      { description, itemName, sourceType: "reviewed-official-menu-description", sources: [source] },
    ],
  ),
  ...round38ReviewedDescriptionCandidates.map(
    ([restaurantId, itemId, itemName, description, source]) => [
      targetKey(restaurantId, itemId),
      { description, itemName, sourceType: "reviewed-official-menu-description", sources: [source] },
    ],
  ),
  ...round37ReviewedDescriptionCandidates.map(
    ([restaurantId, itemId, itemName, description, source]) => [
      targetKey(restaurantId, itemId),
      { description, itemName, sourceType: "reviewed-official-menu-description", sources: [source] },
    ],
  ),
  ...round36ReviewedDescriptionCandidates.map(
    ([restaurantId, itemId, itemName, description, source]) => [
      targetKey(restaurantId, itemId),
      { description, itemName, sourceType: "reviewed-official-menu-description", sources: [source] },
    ],
  ),
  ...round35ReviewedDescriptionCandidates.map(
    ([restaurantId, itemId, itemName, description, source]) => [
      targetKey(restaurantId, itemId),
      {
        description,
        itemName,
        sourceType: "reviewed-official-menu-description",
        sources: [source],
      },
    ],
  ),
  ...round34ReviewedDescriptionCandidates.map(
    ([restaurantId, itemId, itemName, description, source]) => [
      targetKey(restaurantId, itemId),
      {
        description,
        itemName,
        sourceType: "reviewed-official-menu-description",
        sources: [source],
      },
    ],
  ),
  ...round33ReviewedDescriptionCandidates.map(
    ([restaurantId, itemId, itemName, description, source]) => [
      targetKey(restaurantId, itemId),
      {
        description,
        itemName,
        sourceType: "reviewed-official-menu-description",
        sources: [source],
      },
    ],
  ),
  ...round32ReviewedDescriptionCandidates.map(
    ([restaurantId, itemId, itemName, description, source]) => [
      targetKey(restaurantId, itemId),
      {
        description,
        itemName,
        sourceType: "reviewed-official-menu-description",
        sources: [source],
      },
    ],
  ),
  ...round31ReviewedDescriptionCandidates.map(
    ([restaurantId, itemId, itemName, description, source]) => [
      targetKey(restaurantId, itemId),
      {
        description,
        itemName,
        sourceType: "reviewed-official-menu-description",
        sources: [source],
      },
    ],
  ),
  ...round30ReviewedDescriptionCandidates.map(
    ([restaurantId, itemId, itemName, description, source]) => [
      targetKey(restaurantId, itemId),
      {
        description,
        itemName,
        sourceType: "reviewed-official-menu-description",
        sources: [source],
      },
    ],
  ),
  ...round29ReviewedDescriptionCandidates.map(
    ([restaurantId, itemId, itemName, description, source]) => [
      targetKey(restaurantId, itemId),
      {
        description,
        itemName,
        sourceType: "reviewed-official-menu-description",
        sources: [source],
      },
    ],
  ),
  ...round28ReviewedDescriptionCandidates.map(
    ([restaurantId, itemId, itemName, description, source]) => [
      targetKey(restaurantId, itemId),
      {
        description,
        itemName,
        sourceType: "reviewed-official-menu-description",
        sources: [source],
      },
    ],
  ),
  ...round27ReviewedDescriptionCandidates.map(
    ([restaurantId, itemId, itemName, description, source]) => [
      targetKey(restaurantId, itemId),
      {
        description,
        itemName,
        sourceType: "reviewed-official-menu-description",
        sources: [source],
      },
    ],
  ),
  [
    targetKey("jireh-bakery-cafe-centreville-va", "frappe"),
    {
      description: "Blended coffee smoothie",
      itemName: "Frappe",
      sourceType: "reviewed-official-menu-description",
      sources: ["https://www.jirehbakerycafe.com/app/store/api/v28/editor/users/131149866/sites/231037580508650722/products?page=1&per_page=200&include=images,media_files,discounts"],
    },
  ],
  ...[
    ["classic-chicken-sandwich", "Classic Chicken Sandwich", "A quarter-pound double-breaded all-white-meat chicken breast with pickles and Colonel’s mayo on a brioche-style bun."],
    ["spicy-chicken-sandwich", "Spicy Chicken Sandwich", "A quarter-pound double-breaded all-white-meat chicken breast with pickles and spicy sauce on a brioche-style bun."],
  ].map(([itemId, itemName, description]) => [
    targetKey("kfc", itemId),
    {
      description,
      itemName,
      sourceType: "reviewed-official-menu-description",
      sources: ["https://locations.kfc.com/ny/manhattan/1922-third-avenue/chickensandwich"],
    },
  ]),
  ...[
    ["baba-ghanoush", "Baba Ghanoush", "Arugula, red onion pickle, and pomegranate.", "https://ivybythelake.com/evening-menu/"],
    ["hummus", "Hummus", "Dried olive, pomegranate, and crumbled cheese, served with pita.", "https://ivybythelake.com/evening-menu/"],
    ["tzatziki", "Tzatziki", "Cucumber, lemon zest, herbs, and mint, served with pita.", "https://ivybythelake.com/evening-menu/"],
    ["spicy-feta", "Spicy Feta", "Concasse tomato, harissa, scallion, and dried black olives, served with pita.", "https://ivybythelake.com/evening-menu/"],
    ["zaatar-fries", "Za'atar Fries", "Crispy fries with za’atar seasoning, house garlic aioli, and Aleppo sauce.", "https://ivybythelake.com/brunch-menu/"],
    ["falafel", "Falafel", "Served with chickpea aioli, pickled parsnip, cucumber, and micro cilantro.", "https://ivybythelake.com/evening-menu/"],
    ["chapli-kabab", "Chapli Kabab", "Spicy beef patty topped with sautéed tomatoes and cilantro toum.", "https://ivybythelake.com/evening-menu/"],
    ["crispy-fried-cauliflower", "Crispy Fried Cauliflower", "Breaded cauliflower served with creamy ranch and pickled bell peppers.", "https://ivybythelake.com/evening-menu/"],
    ["halloumi", "Halloumi", "Cyprus halloumi, roasted honey, red grapes, dukkah, rosemary, arugula, and lemon zest.", "https://ivybythelake.com/brunch-menu/"],
    ["crispy-wings", "Crispy Wings", "Fried battered wings with a choice of harissa buffalo, house BBQ, soy garlic, or dried lemon and sumac spice.", "https://ivybythelake.com/evening-menu/"],
    ["fattoush-salad", "Fattoush Salad", "Lebanese salad with fresh vegetables and a minty pomegranate dressing.", "https://ivybythelake.com/evening-menu/"],
    ["caprese-crostini", "Caprese Crostini", "Burrata, cherry tomato, pesto, and sumac served on sliced baguette.", "https://ivybythelake.com/evening-menu/"],
    ["greek-salad", "Greek Salad", "Lettuce, concasse tomato, olives, caper fruit, yellow pepper, and crumbled feta cheese.", "https://ivybythelake.com/evening-menu/"],
    ["chapli-kabab-burger", "Chapli Kabab Burger", "Fig chutney, pickled red pepper, goat cheese, and arugula, served with sumac fries.", "https://ivybythelake.com/evening-menu/"],
    ["chicken-kabab", "Chicken Kabab", "Marinated grilled chicken served with basmati rice and Ivy’s house salad.", "https://ivybythelake.com/evening-menu/"],
    ["beef-kofta", "Beef Kofta", "Served with Lebanese couscous, tomatoes, cucumber, and labneh.", "https://ivybythelake.com/evening-menu/"],
    ["mixed-grill", "Mixed Grill", "Beef kofta, harissa chicken, hanger steak, chicken kabob, mixed vegetables, cilantro toum, harissa, garlic toum, and pickled vegetables.", "https://ivybythelake.com/evening-menu/"],
    ["assorted-macaroons", "Assorted Macaroons", "Crisp shells with chewy, airy interiors and complementary fillings.", "https://ivybythelake.com/evening-menu/"],
    ["ny-cheesecake", "NY Cheesecake", "Classic cheesecake with strawberry yogurt and fresh berries.", "https://ivybythelake.com/evening-menu/"],
    ["melted-dubai-chocolate", "Melted Dubai Chocolate", "Pistachio ice cream, kadaif, berries, and hot chocolate.", "https://ivybythelake.com/evening-menu/"],
    ["pistachio-tres-leches-cake", "Pistachio Tres Leches Cake", "Sponge cake soaked in pistachio milk sauce with labneh frosting, pistachio pieces, and dried roses.", "https://ivybythelake.com/evening-menu/"],
    ["vanilla-ice-cream-stuffed-baklava", "Vanilla Ice Cream Stuffed Baklava", "Phyllo pastry with vanilla ice cream, powdered sugar, fresh berries, rose petals, and chocolate drizzle.", "https://ivybythelake.com/evening-menu/"],
    ["smores-deluxe-experience", "Smores Deluxe Experience", "Halal marshmallows, caramel chocolate, Reese’s cups, Hershey’s chocolate, and strawberries.", "https://ivybythelake.com/evening-menu/"],
    ["dessert-board", "Dessert Board", "New York cheesecake, pistachio tres leches cake, assorted macaroons, and vanilla ice cream stuffed baklava.", "https://ivybythelake.com/evening-menu/"],
    ["loaded-fries", "Loaded Fries", "Crispy fries with shaved cheese and pickled vegetables.", "https://ivybythelake.com/evening-menu/"],
  ].map(([itemId, itemName, description, source]) => [
    targetKey("ivy-by-the-lake-sterling-va-dc-metro", itemId),
    {
      description,
      itemName,
      sourceType: "reviewed-official-menu-description",
      sources: [source],
    },
  ]),
  ...[
    ["fried-shrimp", "Fried Shrimp", "Hand-breaded, golden-fried shrimp served with coleslaw and hushpuppies."],
    ["hickory-bacon", "Hickory Bacon", "Bacon, cheddar cheese, sautéed onions, pickles, and Mojo Mild sauce."],
    ["pulled-chicken", "Pulled Chicken", "Smoked for two to three hours and hand-pulled."],
    ["pulled-pork", "Pulled Pork", "Smoked for 12 to 13 hours and hand-pulled."],
    ["ribs-chicken", "Ribs + Chicken", "Four St. Louis-style ribs with a Memphis quarter chicken, garnished with hushpuppies and coleslaw and served with crispy fries."],
    ["ribs-wings", "Ribs + Wings", "Four St. Louis-style ribs with five smoked wings, garnished with hushpuppies and coleslaw and served with crispy fries."],
    ["smoked-sausage", "Smoked Sausage", "Two hickory-smoked sausage links with sautéed onions."],
    ["the-chicken-crispers", "The Chicken Crispers", "Five crispy-fried, hand-breaded tenderloins garnished with hushpuppies and coleslaw and served with crispy fries."],
  ].map(([itemId, itemName, description]) => [
    targetKey("osm-red-hot-blue-1448579525", itemId),
    {
      description,
      itemName,
      sourceType: "reviewed-official-menu-description",
      sources: ["https://redhotandblue.com/menu/"],
    },
  ]),
  ...[
    ["current-caesar-entree-salad", "Caesar Entrée Salad", "Romaine, shredded Parmesan, croutons, and Caesar dressing."],
    ["current-fried-shrimp", "Fried Shrimp", "Hand-breaded, golden-fried shrimp served with coleslaw and hushpuppies."],
    ["current-garden-entree-salad", "Garden Entrée Salad", "Seasonal greens, tomato, cucumbers, carrots, cheddar and Jack cheeses, and croutons."],
    ["current-hickory-bacon", "Hickory Bacon", "Bacon, cheddar cheese, sautéed onions, pickles, and Mojo Mild sauce."],
    ["current-pulled-chicken", "Pulled Chicken", "Smoked for two to three hours and hand-pulled."],
    ["current-pulled-pork", "Pulled Pork", "Smoked for 12 to 13 hours and hand-pulled."],
    ["current-ribs-chicken", "Ribs + Chicken", "Four St. Louis-style ribs with a Memphis quarter chicken, garnished with hushpuppies and coleslaw and served with crispy fries."],
    ["current-ribs-wings", "Ribs + Wings", "Four St. Louis-style ribs with five smoked wings, garnished with hushpuppies and coleslaw and served with crispy fries."],
    ["current-shakin-bacon-cheese-fries", "Shakin’ Bacon Cheese Fries", "French fries smothered with cheddar and Jack cheeses and crispy bacon."],
    ["current-smoked-sausage", "Smoked Sausage", "Two hickory-smoked sausage links with sautéed onions."],
    ["current-the-chicken-crispers", "The Chicken Crispers", "Five crispy-fried, hand-breaded tenderloins garnished with hushpuppies and coleslaw and served with crispy fries."],
  ].map(([itemId, itemName, description]) => [
    targetKey("red-hot-and-blue-laurel-laurel-md-dc-metro", itemId),
    {
      description,
      itemName,
      sourceType: "reviewed-image-pdf-menu",
      sources: [
        "https://redhotandblue.com/wp-content/uploads/2021/09/Laurel_DineIn.pdf",
      ],
    },
  ]),
]);

for (const restaurant of repository.restaurants ?? []) {
  const fresh = readFresh(restaurant.id);
  const candidates = buildFreshCandidates(fresh, restaurant);
  const itemNames = new Set((restaurant.items ?? []).map((item) => normalize(item.name)).filter(Boolean));
  const itemNameCounts = new Map();
  for (const itemName of itemNamesFromRestaurant(restaurant)) {
    itemNameCounts.set(itemName, (itemNameCounts.get(itemName) ?? 0) + 1);
  }

  for (const item of restaurant.items ?? []) {
    const key = targetKey(restaurant.id, item.id ?? item.itemId);
    const previous = previousByTarget.get(key);
    const current = descriptionDecision(item.description, item, { itemNames });

    if (previous && !isKnownExtractionArtifact(
      restaurant.id,
      String(item.id ?? item.itemId ?? ""),
      previous.description,
    ) && (
      normalize(previous.itemName) === normalize(item.name)
      || item.description === previous.description
    )) {
      const prior = descriptionDecision(previous.description, item, {
        itemNames,
        sourceType: previous.sourceTypes?.[0] ?? "legacy-verified-recovery",
        exactIdMatch: previous.classification === "exact_id",
      });
      if (prior.usable && (!current.usable || current.value === prior.value)) {
        records.push({
          ...previous,
          itemName: item.name,
          category: item.category ?? null,
          description: prior.value,
          sourceTypes: previous.sourceTypes ?? ["legacy-verified-recovery"],
        });
        decisions.retainedPrevious += 1;
        if (!current.usable) {
          decisions.restoredPrevious += 1;
          affectedRestaurants.add(restaurant.id);
        }
        continue;
      }
    }

    if (current.usable) {
      decisions.skippedExisting += 1;
      continue;
    }

    const exactId = candidates.byId.get(String(item.id ?? item.itemId ?? "")) ?? [];
    const exactName = candidates.byName.get(normalize(item.name)) ?? [];
    if (exactId.length === 0 && exactName.length > 0 && itemNameCounts.get(normalize(item.name)) !== 1) {
      decisions.rejectedAmbiguous += 1;
      continue;
    }
    const pool = exactId.length > 0 ? exactId : exactName;
    if (pool.length === 0) continue;

    // Artifact targets are keyed to the canonical catalog item. An upstream
    // source may use a different ID and reach this item through exact-name
    // matching, so enforce the exclusion again after the canonical match is
    // known rather than relying only on the source-item gate.
    const trusted = pool.filter((candidate) =>
      candidate.trusted
      && !isKnownExtractionArtifact(
        restaurant.id,
        String(item.id ?? item.itemId ?? ""),
        candidate.description,
      ));
    if (trusted.length === 0) {
      decisions.rejectedUntrusted += 1;
      continue;
    }

    const assessed = trusted.map((candidate) => ({
      ...candidate,
      decision: descriptionDecision(candidate.description, item, {
        itemNames,
        sourceType: candidate.sourceType,
        exactIdMatch: exactId.length > 0,
        reviewedIngredientList:
          restaurant.id === "true-food-kitchen" &&
          candidate.sourceType === "pdf-menu",
        enforceFreshSectionHeading: true,
        enforceStrictFreshCandidate: true,
      }),
    }));
    const usable = assessed
      .filter((candidate) => candidate.decision.usable);
    if (usable.length === 0) {
      decisions.rejectedQuality += 1;
      for (const candidate of assessed) recordQualityRejection(restaurant, item, candidate);
      continue;
    }

    const descriptions = new Map();
    for (const candidate of usable) {
      const normalizedDescription = normalize(candidate.decision.value);
      const existing = descriptions.get(normalizedDescription);
      if (existing) {
        existing.sources.push(...candidate.sources);
        existing.sourceTypes.push(candidate.decision.acceptedSourceType ?? candidate.sourceType);
      }
      else descriptions.set(normalizedDescription, {
        description: candidate.decision.value,
        sources: [...candidate.sources],
        sourceTypes: [candidate.decision.acceptedSourceType ?? candidate.sourceType],
      });
    }
    if (descriptions.size !== 1) {
      decisions.rejectedAmbiguous += 1;
      ambiguityExamples.push({
        restaurantId: restaurant.id,
        itemId: String(item.id ?? item.itemId ?? ""),
        itemName: item.name,
        candidates: [...descriptions.values()],
      });
      continue;
    }

    const selected = [...descriptions.values()][0];
    const classification = exactId.length > 0 ? "exact_id" : "exact_name";
    records.push({
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      itemId: String(item.id ?? item.itemId),
      itemName: item.name,
      category: item.category ?? null,
      classification,
      matchKey: classification === "exact_id"
        ? "restaurantId+itemId+normalizedName"
        : "restaurantId+normalizedName",
      description: selected.description,
      sources: unique(selected.sources),
      sourceTypes: unique(selected.sourceTypes),
    });
    acceptedFresh.push({
      restaurantId: restaurant.id,
      itemId: String(item.id ?? item.itemId),
      itemName: item.name,
      classification,
      description: selected.description,
      sources: unique(selected.sources),
      sourceTypes: unique(selected.sourceTypes),
    });
    freshRecoveryTargets.add(targetKey(restaurant.id, String(item.id ?? item.itemId)));
    decisions[classification === "exact_id" ? "addedExactId" : "addedExactName"] += 1;
    affectedRestaurants.add(restaurant.id);
  }
}

records.sort((left, right) =>
  left.restaurantId.localeCompare(right.restaurantId) || left.itemId.localeCompare(right.itemId),
);
assertUniqueTargets(records);
assertPrudentRecoveryBatch(records, freshRecoveryTargets);

const exactIdRecoverable = records.filter((record) => record.classification === "exact_id").length;
const exactNameRecoverable = records.filter((record) => record.classification === "exact_name").length;
const generatedAt = repository.generatedAt ?? new Date().toISOString();
const plan = {
  schemaVersion: 1,
  generatedAt,
  targetCatalog: path.relative(root, repositoryPath),
  targetCatalogSha256: sha(repositoryBytes),
  exactIdRecoverable,
  exactNameRecoverable,
  recoveryCount: records.length,
  conflictCount: decisions.rejectedAmbiguous,
  fuzzyOrSemanticMatching: false,
  records,
};
const planBytes = gzipSync(Buffer.from(JSON.stringify(plan)), { level: 9 });
const planSha256 = sha(planBytes);
const overlayName = `v1-${planSha256.slice(0, 20)}.json.gz`;
const manifest = {
  schemaVersion: 1,
  generatedAt,
  activeOverlay: overlayName,
  planSha256,
  recoveryCount: records.length,
  exactIdCount: exactIdRecoverable,
  exactNameCount: exactNameRecoverable,
  conflictCountSkipped: decisions.rejectedAmbiguous,
  fuzzyOrSemanticMatching: false,
};
const report = {
  schemaVersion: 1,
  generatedAt,
  apply,
  repositoryRestaurantCount: repository.restaurants?.length ?? 0,
  repositoryItemCount: (repository.restaurants ?? []).reduce(
    (sum, restaurant) => sum + (restaurant.items?.length ?? 0),
    0,
  ),
  previousRecoveryCount: previousPlan?.records?.length ?? 0,
  recoveryCount: records.length,
  affectedRestaurantCount: affectedRestaurants.size,
  planSha256,
  overlay: `data/restaurant-verification/description-recovery/${overlayName}`,
  decisions,
  qualityRejections: {
    byReason: rejectionReasons,
    bySourceType: rejectionSourceTypes,
    examples: rejectionExamples,
  },
  ambiguityExamples,
  acceptedFresh,
  assertions: [
    "Existing usable descriptions are never overwritten.",
    "Fresh recoveries require an exact item ID or an unambiguous normalized item-name match.",
    "Fresh recoveries require a configured source or a restaurant-owned domain.",
    "Every newly accepted recovery retains an auditable HTTP source URL.",
    "A final post-build gate rejects visible truncation, promotional calls to action, metadata, and extraction bleed.",
    "Fuzzy and semantic matching are disabled.",
    "Descriptions remain non-exhaustive menu copy and do not alter direct allergen evidence.",
  ],
};

if (apply) {
  fs.mkdirSync(recoveryDirectory, { recursive: true });
  atomicWrite(path.join(recoveryDirectory, overlayName), planBytes);
  atomicWrite(manifestPath, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
}
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
atomicWrite(reportPath, Buffer.from(`${JSON.stringify(report, null, 2)}\n`));
console.log(JSON.stringify(report, null, 2));

function readPreviousPlan(manifest) {
  if (!manifest?.activeOverlay) return null;
  const file = path.join(recoveryDirectory, manifest.activeOverlay);
  if (!fs.existsSync(file)) return null;
  const bytes = fs.readFileSync(file);
  if (manifest.planSha256 && sha(bytes) !== manifest.planSha256) {
    throw new Error("Existing description recovery overlay does not match its manifest hash.");
  }
  return JSON.parse(gunzipSync(bytes).toString("utf8"));
}

function readFresh(restaurantId) {
  const file = path.join(freshDirectory, `${restaurantId}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return value.status === "completed" ? value : null;
  } catch {
    decisions.invalidFreshAudit += 1;
    return null;
  }
}

function buildFreshCandidates(fresh, restaurant) {
  const byId = new Map();
  const byName = new Map();
  for (const item of restaurant.items ?? []) {
    const reviewed = reviewedSourceBackedDescriptionCandidates.get(
      targetKey(restaurant.id, String(item.id ?? item.itemId ?? "")),
    );
    if (!reviewed) continue;
    const candidate = {
      description: reviewed.description,
      sources: reviewed.sources,
      sourceType: reviewed.sourceType,
      trusted: true,
    };
    add(byId, String(item.id ?? item.itemId ?? ""), candidate);
  }
  if (!fresh?.restaurant) return { byId, byName };
  const sourceByUrl = new Map();
  const configuredHosts = new Set();
  for (const source of fresh.sources ?? []) {
    for (const value of [source.url, source.finalUrl]) {
      if (!value) continue;
      sourceByUrl.set(canonicalUrl(value), source);
      if (source.configured === true) {
        try {
          configuredHosts.add(new URL(value).hostname.toLowerCase());
        } catch {
          // Invalid source URLs remain untrusted.
        }
      }
    }
  }
  for (const item of fresh.restaurant.items ?? []) {
    if (!item?.description) continue;
    const sources = unique(item.sourceUrls ?? []);
    const sourceUrls = item.sourceUrls ?? [];
    const trustedByOwnership = sourceUrls.some((url) => {
      const source = sourceByUrl.get(canonicalUrl(url));
      let hostname = null;
      try {
        hostname = new URL(url).hostname.toLowerCase();
      } catch {
        // Invalid candidate URLs remain untrusted.
      }
      return source?.configured === true
        || (hostname && configuredHosts.has(hostname))
        || isRestaurantOwned(url, restaurant.domain);
    });
    const trusted = trustedByOwnership && isTrustedRestaurantSpecificSource(
      restaurant.id,
      sourceUrls,
      item.sourceType ?? "unknown",
    ) && !isKnownExtractionArtifact(
      restaurant.id,
      String(item.id ?? item.itemId ?? ""),
      item.description,
    );
    // Some ordering payloads split a trailing consumer advisory at its colon,
    // leaving a literal "Note" on otherwise complete menu copy.
    const recoveredDescription = String(item.description ?? "")
      .replace(/\s+Note\.?$/i, "")
      .trim();
    const candidate = {
      description: recoveredDescription,
      sources,
      sourceType: item.sourceType ?? "unknown",
      trusted,
    };
    add(byId, String(item.id ?? item.itemId ?? ""), candidate);
    add(byName, normalize(item.name), candidate);
  }
  return { byId, byName };
}

function itemNamesFromRestaurant(restaurant) {
  return (restaurant.items ?? []).map((item) => normalize(item.name)).filter(Boolean);
}

function isTrustedRestaurantSpecificSource(restaurantId, sourceUrls, sourceType) {
  if (restaurantId === "philippe-chow-dc-washington-dc-dc-metro") {
    // The generic scraper currently merges identical item IDs across the DC,
    // Fifth Avenue, and Downtown NYC menus. Until it preserves field-level
    // source lineage, none of those merged descriptions is safe to recover.
    return false;
  }
  if (
    restaurantId === "joes-cafe-sterling-va-dc-metro"
    && sourceType === "html-sequential-priced-menu"
  ) {
    return false;
  }
  if (
    restaurantId === "mike-s-american-springfield-va-dc-metro"
    && sourceUrls.some((value) => /\/api\/vendors\/(?!mikes-american-grill(?:[/?#]|$))/i.test(value))
  ) {
    return false;
  }
  if (
    restaurantId === "silverado-annandale-va-dc-metro"
    && sourceUrls.some((value) => /\/api\/vendors\/(?!silverado(?:[/?#]|$))/i.test(value))
  ) {
    return false;
  }
  if (
    restaurantId === "replacement-limani-washington-dc"
    && sourceUrls.some((value) => /(?:rockefeller|new-york|nyc)/i.test(value))
  ) {
    return false;
  }
  if (restaurantId === "planta-bethesda-bethesda-md-dc-metro") {
    return sourceUrls.some((value) => /bethesda|planta-dc-4910-elm-street/i.test(value));
  }
  if (restaurantId !== "rpm-italian-dc") return true;
  if (sourceType !== "leye-item-wrap") return false;
  const rpmUrls = sourceUrls.filter((value) => {
    try {
      return new URL(value).hostname.toLowerCase().replace(/^www\./, "") === "rpmrestaurants.com";
    } catch {
      return false;
    }
  });
  return rpmUrls.some((value) => /\/rpm-italian-d-c(?:\/|$)/i.test(new URL(value).pathname))
    && !rpmUrls.some((value) => /\/rpm-steak-chicago(?:\/|$)/i.test(new URL(value).pathname));
}

function isKnownExtractionArtifact(restaurantId, itemId, description) {
  const key = targetKey(restaurantId, itemId);
  const knownArtifact = knownExtractionArtifacts.get(key);
  const normalizedDescription = normalize(description);
  return knownExtractionArtifactTargets.has(key)
    || (Array.isArray(knownArtifact)
      ? knownArtifact.includes(normalizedDescription)
      : knownArtifact === normalizedDescription)
    // The audit scraper deliberately shortens exceptionally long source text.
    // A trailing ellipsis therefore proves this is a capture preview, not the
    // restaurant's complete description, and it must never reach the catalog.
    || /(?:\.\.\.|…)$/.test(String(description ?? "").trim());
}


function recordQualityRejection(restaurant, item, candidate) {
  const reason = candidate.decision.reason ?? "unknown";
  const sourceType = candidate.sourceType ?? "unknown";
  rejectionReasons[reason] = (rejectionReasons[reason] ?? 0) + 1;
  rejectionSourceTypes[sourceType] = (rejectionSourceTypes[sourceType] ?? 0) + 1;
  if (rejectionExamples.length >= 2_000) return;
  rejectionExamples.push({
    restaurantId: restaurant.id,
    itemId: String(item.id ?? item.itemId ?? ""),
    itemName: item.name,
    sourceType,
    reason,
    description: candidate.description,
  });
}

function isRestaurantOwned(value, domain) {
  if (!domain) return false;
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    const normalizedDomain = String(domain).toLowerCase().replace(/^www\./, "");
    return hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`);
  } catch {
    return false;
  }
}

function canonicalUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return String(value ?? "");
  }
}

function add(map, key, value) {
  if (!key) return;
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

function assertUniqueTargets(values) {
  const keys = new Set();
  for (const record of values) {
    const key = targetKey(record.restaurantId, record.itemId);
    if (keys.has(key)) throw new Error(`Duplicate recovery target: ${key}`);
    keys.add(key);
  }
}

function assertPrudentRecoveryBatch(values, freshTargets) {
  for (const record of values) {
    if (
      freshTargets.has(targetKey(record.restaurantId, record.itemId)) &&
      !(record.sources ?? []).some((source) => /^https?:\/\//i.test(source))
    ) {
      throw new Error(
        `Recovery target has no auditable HTTP source: ${record.restaurantId}/${record.itemId}`,
      );
    }
    const decision = descriptionDecision(record.description, record, {
      sourceType: record.sourceTypes?.[0],
      exactIdMatch: record.classification === "exact_id",
      enforceFreshSectionHeading: freshTargets.has(
        targetKey(record.restaurantId, record.itemId),
      ),
      enforceStrictFreshCandidate: freshTargets.has(
        targetKey(record.restaurantId, record.itemId),
      ),
    });
    if (!decision.usable || decision.value !== record.description) {
      throw new Error(
        `Recovery target failed the final prudent quality gate: ${record.restaurantId}/${record.itemId}`,
      );
    }
  }
}

function targetKey(restaurantId, itemId) {
  return `${restaurantId}\u0000${itemId}`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function sha(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function atomicWrite(file, bytes) {
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, bytes);
  fs.renameSync(temporary, file);
}

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}
