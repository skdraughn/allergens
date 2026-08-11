import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAnafreAuditSnapshot,
  parseAnafreLinkedOrderingMenu,
  parseAnafreOfficialHappyHour,
  parseAnafreOfficialMenu,
  parseAnafreOfficialNonAlcoholicDrinks,
} from "./anafre-audit-catalog.mjs";

const officialMenuFixture = `
  <div class="menu-section"><div class="menu-section-title">Appetizers</div><div class="menu-items">
    <div class="menu-item"><div class="menu-item-title">Oysters al Carbon con Crab Meat</div><div class="menu-item-description">jalapeño butter sauce, cheese, bolilo bread</div><div class="menu-item-price-bottom">$14.95</div></div>
    <div class="menu-item"><div class="menu-item-title">Queso Fundindo en Hoja de Platano</div><div class="menu-item-description">3 cheeses, corn epazote, tortillas</div><div class="menu-item-price-bottom">$10</div></div>
  </div></div>
  <div class="menu-section"><div class="menu-section-title">Pizzas</div><div class="menu-items">
    <div class="menu-item"><div class="menu-item-title">The Classic</div><div class="menu-item-description">pepperoni, tomato sauce, chihuahua cheese, fresh mozzarella cheese</div><div class="menu-item-price-bottom">$10</div></div>
    <div class="menu-item"><div class="menu-item-title">Churrasco à la Carbon</div><div class="menu-item-description">grilled steak, pinto beans, white rice, salsa verde</div><div class="menu-item-price-bottom">$17.95</div></div>
  </div></div>`;

const happyHourFixture = `
  <div role="tabpanel" aria-label="Happy Hour"><div class="menu-section"><div class="menu-items">
    <div class="menu-item"><div class="menu-item-title">Bites</div><div class="menu-item-price-bottom">$10</div></div>
    <div class="menu-item"><div class="menu-item-title">Calamari</div></div>
    <div class="menu-item"><div class="menu-item-title">Birria Pizza</div></div>
    <div class="menu-item"><div class="menu-item-title">Drinks:</div></div>
    <div class="menu-item"><div class="menu-item-title">Casa Margarita</div></div>
  </div></div></div>
  <div role="tabpanel" aria-label="Non-Alcoholic Drinks">
    <div class="menu-section"><div class="menu-section-title">Sodas - $3</div><div class="menu-items">
      <div class="menu-item"><div class="menu-item-title">Diet Coke</div></div>
    </div></div>
    <div class="menu-section"><div class="menu-section-title">Agua Fresca</div><div class="menu-items">
      <div class="menu-item"><div class="menu-item-title">Ask your server what we're serving today!</div><div class="menu-item-price-bottom">$6</div></div>
    </div></div>
  </div>`;

const vendorFixture = `
  <table><tr id="c36"><td><div id="c36"><a name="36">TO SHARE</a></div></td></tr><tr><td><table><tr>
    <td onclick="x='?categoryId=36&itemId=338&sizeId=0'"><table><tr><td><font>Oysters al Carbon con Crab Meat</font></td><td>$15.95</td></tr></table></td>
    <td onclick="x='?categoryId=36&itemId=557&sizeId=0'"><table><tr><td><font>mussels a la mexicana</font></td><td>$17.95</td></tr></table></td>
  </tr></table></td></tr>
  <tr id="c7"><td><div id="c7"><a name="7">BEVERAGES</a></div></td></tr><tr><td><table><tr>
    <td onclick="x='?categoryId=7&itemId=49&sizeId=0'"><table><tr><td><font>Diet Coke</font></td><td>$2.00</td></tr></table></td>
  </tr></table></td></tr>
  <tr id="c44"><td><div id="c44"><a name="44">BOTTLE BEERS</a></div></td></tr><tr><td><table><tr>
    <td onclick="x='?categoryId=44&itemId=396&sizeId=0'"><table><tr><td><font>Corona</font></td><td>$6.00</td></tr></table></td>
  </tr></table></td></tr></table>`;

test("parses and conservatively classifies the restaurant-issued menu", () => {
  const rows = parseAnafreOfficialMenu(officialMenuFixture);
  assert.equal(rows.length, 4);
  assert.equal(rows[1].name, "Queso Fundido en Hoja de Platano");
  assert.deepEqual(rows[0].allergens.sort(), ["gluten", "milk", "shellfish", "wheat"]);
  assert.deepEqual(rows[2].allergens.sort(), ["gluten", "milk", "wheat"]);
  assert.equal(rows[3].category, "Entrées");
  assert.equal(rows[3].allergenSourceType, "unavailable");
});

test("extracts only food bites from the official happy hour panel", () => {
  const rows = parseAnafreOfficialHappyHour(happyHourFixture);
  assert.deepEqual(rows.map((row) => row.name), ["Calamari", "Birria Pizza"]);
  assert.deepEqual(rows[0].allergens, ["shellfish"]);
  assert.deepEqual(rows[1].allergens, ["wheat", "gluten"]);
  assert.ok(rows.every((row) => row.price === 10));
});

test("extracts official nonalcoholic beverages without turning instructions into items", () => {
  const rows = parseAnafreOfficialNonAlcoholicDrinks(happyHourFixture);
  assert.deepEqual(rows.map((row) => row.name), ["Diet Coke", "Agua Fresca"]);
  assert.deepEqual(rows.map((row) => row.price), [3, 6]);
  assert.equal(rows[1].description, "Ask your server what we're serving today!");
});

test("keeps linked-vendor rows unavailable and excludes alcohol categories", () => {
  const rows = parseAnafreLinkedOrderingMenu(vendorFixture);
  assert.deepEqual(rows.map((row) => row.name), [
    "Oysters al Carbon con Crab Meat",
    "mussels a la mexicana",
    "Diet Coke",
  ]);
  assert.ok(rows.every((row) => row.allergenSourceType === "unavailable"));
  assert.ok(!rows.some((row) => row.name === "Corona"));
});

test("consolidates source variants and leaves beverages last", () => {
  const snapshot = buildAnafreAuditSnapshot(
    {
      officialMenuHtml: officialMenuFixture,
      officialHomeHtml: happyHourFixture,
      linkedOrderingHtml: vendorFixture,
    },
    { retrievedAt: "2026-07-15T05:09:33.307Z" },
  );
  assert.equal(snapshot.presentationCount, 11);
  assert.equal(snapshot.itemCount, 9);
  const oysters = snapshot.items.find((row) => row.name === "Oysters al Carbon con Crab Meat");
  assert.equal(oysters.presentations.length, 2);
  assert.equal(oysters.sourceType, "official-menu-and-linked-ordering");
  assert.equal(snapshot.items.at(-1).category, "Beverages");
  assert.match(snapshot.sourceWarning, /linked-vendor-only rows remain allergen-unavailable/i);
});
