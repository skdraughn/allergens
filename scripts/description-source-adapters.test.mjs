import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  extractAnbeOnlineKitchenApiLinksFromBundle,
  extractAnbeOnlineKitchenItems,
  extractHtmlItems,
  extractJsonMenuFragmentItems,
  extractOfficialReaderMarkdownItems,
  extractProductPageItem,
  extractYextMenuScriptItems,
} from "./pipeline/legacy-scrape-engine.mjs";

test("Citizens & Culture reviewed image fixture preserves current official descriptions", () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL("../data/fixtures/citizens-culture-official-image-menu.json", import.meta.url),
      "utf8",
    ),
  );
  const byName = new Map(fixture.items.map((item) => [item.name, item]));

  assert.match(byName.get("C&C Smash Burger").description, /smashed patties/i);
  assert.match(byName.get("Trout Farro").description, /oyster mushrooms/i);
  assert.equal(fixture.sourceUrls.length, 3);
});

test("top-level official menu pages discover food-category child pages", () => {
  const result = extractHtmlItems(
    '<html><title>Our Menu</title><a href="/menu/cheesesteaks">Cheesesteaks</a></html>',
    { category: "Fast Food", id: "mcdonalds", name: "Menu Test" },
    "https://www.charleys.com/menu/",
    "menu",
  );

  assert.deepEqual(result.menuPageLinks, [
    { label: "Cheesesteaks", url: "https://www.charleys.com/menu/cheesesteaks" },
  ]);
});

test("WordPress product APIs preserve official product descriptions", () => {
  const records = extractJsonMenuFragmentItems(
    JSON.stringify([
      {
        title: { rendered: "Football Cake &#8211; Vanilla" },
        excerpt: {
          rendered: "<p>Vanilla cake in shape of a football. Serves 4-8.</p>",
        },
        link: "https://heidelbergbakery.com/product/football-cake-vanilla/",
      },
    ]),
    {
      category: "Bakery",
      id: "heidelberg-pastry-shoppe-arlington-va",
      name: "Heidelberg Pastry Shoppe",
    },
    "https://heidelbergbakery.com/wp-json/wp/v2/product?per_page=100&page=1",
    "menu",
  );

  assert.equal(records.length, 1);
  assert.equal(records[0].name, "Football Cake – Vanilla");
  assert.equal(
    records[0].description,
    "Vanilla cake in shape of a football. Serves 4-8.",
  );
  assert.equal(records[0].sourceKind, "json-structured");
});

test("Tatte rendered product cards preserve the item-bounded menu description", () => {
  const names = ["Apple Bowl", "Berry Bowl", "Corn Bowl", "Date Bowl", "Egg Bowl", "Fig Bowl", "Grape Bowl", "Herb Bowl", "Iced Bowl", "Jam Bowl"];
  const cards = names.map((name, index) => `
    <button class="product-card" aria-label="Customize: ${name}, $12.00">
      <div class="product-content">
        <h3>${name}</h3>
        <div class="product-price-info"><span><span>•</span> $12.00</span></div>
        <div class="bc-markdown"><p>Poached eggs, spinach, and feta for item ${index}. (390 cal. Contains: Milk, Egg)</p></div>
      </div>
    </button>`).join("");
  const result = extractHtmlItems(
    `<html><body>${cards}</body></html>`,
    { category: "Bakery", id: "tatte-dc", name: "Tatte Bakery & Cafe" },
    "https://tattebakery.com/menu/247374",
    "menu",
  );
  const item = result.items.find((candidate) => candidate.name === "Apple Bowl");

  assert.equal(item?.description, "Poached eggs, spinach, and feta for item 0. (390 cal. Contains: Milk, Egg)");
  assert.notEqual(item?.description, "•");
});

test("product pages prefer an exact structured MenuItem description over generic SEO copy", () => {
  const item = extractProductPageItem(
    `<html><head>
      <meta name="description" content="Explore our menu, cocktails, wines, and more!">
      <script type="application/ld+json">{
        "@context":"https://schema.org",
        "@type":"MenuItem",
        "name":"Italian Chopped",
        "description":"Roasted turkey, salami, garbanzo beans, tomatoes, mozzarella, and basil."
      }</script>
    </head><body><h1>Italian Chopped</h1></body></html>`,
    { category: "Salads", id: "california-pizza-kitchen", name: "California Pizza Kitchen" },
    "https://example.com/menu/salads/italian-chopped",
    "Italian Chopped",
  );

  assert.equal(
    item?.description,
    "Roasted turkey, salami, garbanzo beans, tomatoes, mozzarella, and basil.",
  );
});

test("Glory Days official reader fallback extracts only described menu items", () => {
  const records = extractOfficialReaderMarkdownItems(
    `Title: Glory Days Grill Menus

URL Source: http://www.glorydaysgrill.com/menus/

Markdown Content:
## STARTERS
### Slam Dunk Pretzels
8 warm, lightly salted pretzel pieces served with beer cheese
### Cheese Fries
## Join Our Victory Club
### Perfect for Any Occasion
Earn points with every visit
`,
    {
      category: "American",
      id: "osm-glory-days-grille-237472337",
      name: "Glory Days Grille",
    },
    "https://www.glorydaysgrill.com/menus/",
    "menu",
  );

  assert.deepEqual(records.map((record) => record.name), ["Slam Dunk Pretzels"]);
  assert.equal(records[0].category, "STARTERS");
  assert.match(records[0].description, /beer cheese/);
});

test("Tiger Dumplings reader fallback recovers Toast descriptions by item slug", () => {
  const records = extractOfficialReaderMarkdownItems(
    `Title: Menu
URL Source: http://tiger-dumplings.com/menu
Markdown Content:
### Soup
* [![Image 1](https://images.example/item.jpg)Shrimp Wonton Soup features tender wontons filled with shrimp. (6 pieces). $6.95](https://tiger-dumplings.com/menu/location/group_1/item-shrimp-wonton-soup-6_24f75b5c-ee99-4ab1-9742-9710debe3089)
* [![Image 2](https://images.example/item.jpg)$5.95](https://tiger-dumplings.com/menu/location/group_1/item-organic-egg-drop-soup_5af867fa-843e-48e4-84a5-62677458c185)
`,
    {
      category: "Chinese",
      id: "tiger-dumplings-arlington-va",
      name: "Tiger Dumplings",
    },
    "https://tiger-dumplings.com/menu",
    "menu",
  );

  assert.equal(records.length, 1);
  assert.equal(records[0].name, "Shrimp Wonton Soup (6)");
  assert.match(records[0].description, /filled with shrimp/);
  assert.equal(records[0].sourceKind, "toast-reader-menu");
});

test("restaurant-linked Toast reader fallback handles links with and without images", () => {
  const records = extractOfficialReaderMarkdownItems(
    `Title: Order Online
URL Source: http://marvsdogsdc.com/menu
Markdown Content:
### Hot Dogs
* [![Image 1](https://images.example/dog.jpg)### Marv's Favorite Dog (ChicagoDog) Chicago style with mustard, onions, relish, tomatoes, pickles, and sport peppers $9.00](https://marvsdogsdc.com/menu/location/group_1/item-marvs-favorite-dog-chicagodog_2c00f992-0280-431e-8c17-7012427d2a7c)
* [$8.00](https://marvsdogsdc.com/menu/location/group_1/item-plain-dog_96a66669-800a-4123-b40f-0e7fcfc19445)
`,
    { category: "Hot Dogs", id: "marvs-dogs-dc", name: "Marv's Dogs" },
    "https://marvsdogsdc.com/menu",
    "menu",
  );

  assert.equal(records.length, 1);
  assert.equal(records[0].name, "Marvs Favorite Dog Chicagodog");
  assert.match(records[0].description, /mustard, onions/);
  assert.equal(records[0].sourceKind, "toast-reader-menu");
});

test("Big Tony's official reader recovers item names from Toast slugs", () => {
  const records = extractOfficialReaderMarkdownItems(
    `Title: Order Online
URL Source: http://bigtonyspizzabar.com/order
Markdown Content:
### SALADS
* [![Image 1](https://images.example/salad.jpg)Antipasto Salad Lettuce, tomato, red onions, green olives, cucumber, and roasted peppers, topped with salami, ham, capicola, provolone cheese $13.00](https://bigtonyspizzabar.com/order/big-tonys-3100-clarendon-blvd/item-antipasto-salad_80c33e6f-6392-4f7c-b466-c9b2f9a421c9)
`,
    {
      category: "Pizza",
      id: "osm-big-tony-s-pizzeria-dive-11767597986",
      name: "Big Tony's Pizzeria & Dive Bar",
    },
    "https://r.jina.ai/http://bigtonyspizzabar.com/order",
    "menu",
  );

  assert.equal(records.length, 1);
  assert.equal(records[0].name, "Antipasto Salad");
  assert.match(records[0].description, /roasted peppers/);
  assert.equal(records[0].sourceKind, "toast-reader-menu");
});

test("Bukom Elementor cards preserve paired official item descriptions", () => {
  const result = extractHtmlItems(
    `<div class="eael-feature-list-content-box"><h2 class="eael-feature-list-title">Chicken Suya.....$15</h2><p class="eael-feature-list-content">Grilled chicken coated with our special peanut rub with fresh tomatoes and onion.</p></div>
     <div class="eael-feature-list-content-box"><h2 class="eael-feature-list-title">Goat Stew .....$26</h2><p class="eael-feature-list-content">Double cooked goat in West African stew served with Jollof rice or house salad.</p></div>
     <div class="eael-feature-list-content-box"><h2 class="eael-feature-list-title">Spinach Stew ...$18</h2><p class="eael-feature-list-content">Spinach cooked into a West African stew, served with Jollof rice or house salad.</p></div>
     <div class="eael-feature-list-content-box"><h2 class="eael-feature-list-title">Oxtail ......$40</h2><p class="eael-feature-list-content">Slow braised oxtail seasoned in spices and savory gravy.</p></div>`,
    { category: "West African", id: "bukom-cafe-dc", name: "Bukom Cafe" },
    "https://bukomdc.com/menu/",
    "menu",
  );

  assert.equal(result.items.length, 4);
  assert.equal(result.items[0].name, "Chicken Suya");
  assert.match(result.items[0].description, /peanut rub/);
});

test("Kung Fu Tea product-image metadata preserves named drink descriptions", () => {
  const result = extractHtmlItems(
    `<div data-widget_type="image.default" title="KUNG FU MILK TEA, Our signature beverage with earl grey tea, cane sugar, and milk powder."></div>
     <div data-widget_type="image.default" title="ROSEHIP LEMONADE, Fresh-squeezed lemonade with hints of rosehip and blueberry."></div>
     <div data-widget_type="image.default" title="TARO SLUSH, Taro blended with ice, milk, and cane sugar."></div>
     <div data-widget_type="image.default" title="MANGO GREEN TEA, Sweet mango and fragrant jasmine green tea."></div>`,
    { category: "Bubble Tea", id: "chain-kung-fu-tea", name: "Kung Fu Tea" },
    "https://www.kungfutea.com/products/",
    "menu",
  );

  assert.equal(result.items.length, 4);
  assert.equal(result.items[0].name, "KUNG FU MILK TEA");
  assert.match(result.items[0].description, /earl grey tea/);
});

test("Sticky Fingers official ordering reader recovers item descriptions", () => {
  const records = extractOfficialReaderMarkdownItems(
    `Title: Order Online
URL Source: http://dc.stickyfingersbakery.com/order/sticky-fingers-bakery-314-carroll-st-nw
Markdown Content:
## Cupcakes
* [![Image 1](https://images.example/cupcake.jpg)Chocolate cake, chocolate frosting, chocolate chips, lots of love. No substitutions. Allergens: wheat, soy $4.00](https://dc.stickyfingersbakery.com/order/sticky-fingers-bakery-314-carroll-st-nw/item-chocolate-love-cupcake_4da248e1-bc4a-495d-a32b-b35ab07a7632)
`,
    { category: "Bakery", id: "sticky-fingers-bakery-dc", name: "Sticky Fingers Bakery" },
    "https://dc.stickyfingersbakery.com/order/sticky-fingers-bakery-314-carroll-st-nw",
    "menu",
  );

  assert.equal(records.length, 1);
  assert.equal(records[0].name, "Chocolate Love Cupcake");
  assert.match(records[0].description, /chocolate frosting/);
  assert.equal(records[0].sourceKind, "toast-reader-menu");
});

test("Dirty Habit SinglePlatform reader recovers structured menu descriptions", () => {
  const records = extractOfficialReaderMarkdownItems(
    `Title: Dirty Habit
URL Source: http://places.singleplatform.com/dirty-habit-0/menu
Markdown Content:
### Brunch
#### Baked French Toast
$21.00
vanilla custard | powdered sugar | blueberry compote

vegetarian

* * *

#### Mimosa
$14.00
orange juice and sparkling wine
`,
    {
      category: "American",
      id: "dirty-habit-washington-dc-dc-metro",
      name: "Dirty Habit",
    },
    "https://places.singleplatform.com/dirty-habit-0/menu",
    "menu",
  );

  assert.deepEqual(records.map((record) => record.name), ["Baked French Toast", "Mimosa"]);
  assert.match(records[0].description, /blueberry compote/);
  assert.equal(records[0].category, "Brunch");
  assert.equal(records[0].sourceKind, "singleplatform-reader-menu");
});

test("Quickway reader fallback keeps only official prose descriptions", () => {
  const records = extractOfficialReaderMarkdownItems(
    `Title: Menu - Quickway Hibachi
URL Source: http://quickwayhibachi.com/menu/
Markdown Content:
# HIBACHI
## Hibachi Chicken
650-870 CAL.
Try our signature dish – juicy chicken grilled to perfection, paired with fresh vegetables and white rice.
[ORDER NOW](https://order.online/example)
## Hibachi Beef
720-940 CAL.
[ORDER NOW](https://order.online/example)
COMBOS
## Chicken & Shrimp
620-840 CAL.
The perfect duo—tender chicken and succulent shrimp grilled to perfection with fresh vegetables.
## Shrimp Tempura
340 CAL.
[ORDER NOW](https://order.online/example)
Drinks
## Bottled Water
[ORDER NOW](https://order.online/example)
`,
    {
      category: "Japanese",
      id: "chain-quickway-japanese-hibachi",
      name: "Quickway Japanese Hibachi",
    },
    "https://quickwayhibachi.com/menu/",
    "menu",
  );

  assert.deepEqual(records.map((record) => record.name), [
    "Hibachi Chicken",
    "Chicken & Shrimp",
  ]);
  assert.equal(records[0].category, "HIBACHI");
  assert.equal(records[1].category, "COMBOS");
  assert.equal(records[0].sourceKind, "official-reader-menu");
});

test("Cubano's reader fallback records the reachable dinner menu without inventing descriptions", () => {
  const records = extractOfficialReaderMarkdownItems(
    `Title: Cubano's Restaurant Bethesda
URL Source: http://toast.app/r/cubano-s-restaurant-bethesda/order
Markdown Content:
## DINNER
### Appetizers
* [$14.00](https://toast.app/r/cubano-s-restaurant-bethesda/order/item-arepitas-de-lechon_2d9db4e4-c6f4-4e02-b92a-918017eb7c7c)
### Cuban Dinner
* [OUT OF STOCK $32.00](https://toast.app/r/cubano-s-restaurant-bethesda/order/item-rabo-encendido_a27c3a33-2644-4353-9dd0-a657e0762cb1)
## DRINKS
### Liquor
* [$12.00](https://toast.app/r/cubano-s-restaurant-bethesda/order/item-aperol_6caf527a-a22e-4da3-9433-22b9824fe292)
`,
    {
      category: "Cuban",
      id: "cubanos-bethesda-md",
      name: "Cubano's Bethesda",
    },
    "https://toast.app/r/cubano-s-restaurant-bethesda/order",
    "menu",
  );

  assert.deepEqual(records.map((record) => record.name), [
    "Arepitas De Lechon",
    "Rabo Encendido",
  ]);
  assert.equal(records[0].description, null);
  assert.equal(records[0].category, "Appetizers");
});

test("Anbe Online Kitchen adapter discovers and extracts official item descriptions", () => {
  const restaurant = {
    category: "Indian",
    id: "replacement-tikka-washington-dc",
    name: "Tikka",
  };
  const referer = "https://tikkadc.com/";
  const links = extractAnbeOnlineKitchenApiLinksFromBundle(
    'posGuid:"D5505C10-5C98-4E1D-8392-909B9D35F6C0",baseUrl:"https://onlinekitchen.salonservice-api.com/"',
    restaurant,
    "https://tikkadc.com/main.abc123.js",
    { referer, role: "anbe-online-kitchen-app-bundle" },
  );

  assert.equal(links.length, 1);
  assert.equal(links[0].fetchOptions.method, "POST");
  const records = extractAnbeOnlineKitchenItems(
    JSON.stringify({
      body: [
        { item: "Chicken Tikka", description: "Clay-oven chicken with yogurt and spices." },
        { item: "Iced Tea", description: "Iced Tea" },
      ],
    }),
    restaurant,
    links[0].url,
    { referer, role: links[0].role },
  );

  assert.equal(records.length, 2);
  assert.equal(records[0].description, "Clay-oven chicken with yogurt and spices.");
  assert.equal(records[1].description, null);
  assert.equal(records[0].sourceKind, "anbe-online-kitchen-api");
  assert.equal(records[0].sourceUrl, referer);
});

test("Yext menu scripts recover descriptions from an official embedded widget", () => {
  const records = extractYextMenuScriptItems(
    `(function(){var data={"html": '<div class="yext-menu"><div class="yext-menu-section"><h1 class="yext-menu-section-title">Appetizers</h1><li class="yext-menu-item-details"><span class="yext-menu-item-name">Chuchura</span><div class="yext-menu-item-desc">Mini-dumpling soup with minced beef, lamb, and onions</div></li></div></div>'};})();`,
    { category: "Central Asian", id: "osm-dolan-4198051508", name: "Dolan" },
    "https://www.dolanuyghur.com/rockville/menu",
    "menu",
    { role: "yext-menu-script" },
  );

  assert.equal(records.length, 1);
  assert.equal(records[0].name, "Chuchura");
  assert.match(records[0].description, /minced beef/);
  assert.equal(records[0].category, "Appetizers");
  assert.equal(records[0].sourceKind, "yext-menu-script");
  assert.equal(records[0].sourceUrl, "https://www.dolanuyghur.com/rockville/menu");
});
