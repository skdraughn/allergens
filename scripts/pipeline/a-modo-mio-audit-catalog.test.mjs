import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildAModoMioAuditSnapshot,
  parseAModoMioOfficialMenu,
  parseAModoMioToastMenu,
} from "./a-modo-mio-audit-catalog.mjs";

const [officialMenuHtml, toastMarkdown] = await Promise.all([
  readFile("data/restaurant-verification/artifacts/osm-a-modo-mio-207944730/official-menu.html", "utf8"),
  readFile("data/restaurant-verification/artifacts/osm-a-modo-mio-207944730/third-party-toast-render-proxy.txt", "utf8"),
]);
const snapshot = buildAModoMioAuditSnapshot({ officialMenuHtml, toastMarkdown });

test("parses every current public menu surface and the linked Toast catalog", () => {
  assert.equal(parseAModoMioOfficialMenu(officialMenuHtml).length, 161);
  assert.equal(parseAModoMioToastMenu(toastMarkdown).length, 116);
  assert.equal(snapshot.itemCount, 185);
  assert.equal(snapshot.items.filter((item) => item.sourceType === "restaurant-issued-structured-menu").length, 161);
  assert.equal(snapshot.items.filter((item) => item.sourceType === "restaurant-linked-vendor-menu").length, 24);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 185);
  assert.equal(snapshot.items.filter((item) => !item.isAvailable).length, 0);
});

test("keeps current online-only products without duplicating every vendor row", () => {
  const byName = new Map(snapshot.items.map((item) => [item.name, item]));

  assert.ok(byName.has("Marinara Personal- 12''"));
  assert.ok(byName.has("Marinara Family - 16''"));
  assert.ok(byName.has("For 3-Gnocchi Sorrentina"));
  assert.ok(byName.has("Pizza Dough"));
  assert.ok(byName.has("BTL Chardonnay Impero"));
  assert.equal(byName.has("Add two meatballs"), false);
  assert.equal(byName.has("Extra Caesar dressing"), false);
  assert.equal(byName.has("A Modo Mio Family- 16''"), false);
  assert.equal(byName.get("A Modo Mio").isConfigurable, true);
});

test("derives only positive restaurant-published ingredient signals", () => {
  const get = (category, name) => snapshot.items.find(
    (item) => item.category === category && item.name === name,
  );

  assert.deepEqual(get("Dinner · Pizze Rosse", "Margherita").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(get("Dinner · Pizze Rosse", "Ischitana").allergens, ["fish", "wheat", "gluten"]);
  assert.deepEqual(get("Dinner · Entrees", "Eggplant and Zucchini Parmigiana").allergens, ["milk"]);
  assert.deepEqual(get("Dessert · Dolci", "Torta Caprese").allergens, ["tree-nut"]);
  assert.deepEqual(get("Online Takeout · Pizze Rosse (tomato sauce)", "Marinara Personal- 12''").allergens, ["wheat", "gluten"]);
  assert.deepEqual(get("Online Takeout · Sides", "Side Caesar").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(get("Catering · Pasta & Entrees", "Penne Pasta").allergens, ["milk", "tree-nut", "wheat", "gluten"]);
  assert.deepEqual(get("Catering · Pasta & Entrees", "Lasagna").allergens, ["milk", "wheat", "gluten"]);
  assert.match(get("Catering · Pasta & Entrees", "Penne Pasta").description, /pine nuts/i);
  assert.deepEqual(get("Lunch · Salads", "House").allergens, []);
  assert.deepEqual(get("Online Wine · RED WINE BOTTLE", "BTL Corvina Tinazzi").allergens, []);
});

test("places all beverage categories after food categories", () => {
  const firstBeverage = snapshot.items.findIndex((item) =>
    /Refreshments|Coffee|Grappa|Digestivi|Tequila|Cognac|Bourbon|Scotch|Dessert Wine|Online Wine/.test(item.category),
  );
  assert.ok(firstBeverage > 0);
  assert.ok(snapshot.items.slice(firstBeverage).every((item) =>
    /Refreshments|Coffee|Grappa|Digestivi|Tequila|Cognac|Bourbon|Scotch|Dessert Wine|Online Wine/.test(item.category),
  ));
});
