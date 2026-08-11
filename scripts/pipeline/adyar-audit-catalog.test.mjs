import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAdyarAuditSnapshot, parseAdyarOfficialMenu, parseAdyarToastMenu } from "./adyar-audit-catalog.mjs";

const restaurantId = "osm-adyar-ananda-bhavan-638589103";
const [officialMenuHtml, toastMarkdown] = await Promise.all([
  readFile(`data/restaurant-verification/artifacts/${restaurantId}/official-menu.html`, "utf8"),
  readFile(`data/restaurant-verification/artifacts/${restaurantId}/third-party-toast-render-proxy.txt`, "utf8"),
]);
const snapshot = buildAdyarAuditSnapshot({ officialMenuHtml, toastMarkdown });
const get = (name) => snapshot.items.find((item) => item.name === name);

test("parses the complete official and time-specific linked menus", () => {
  assert.equal(parseAdyarOfficialMenu(officialMenuHtml).length, 147);
  const toastRows = parseAdyarToastMenu(toastMarkdown);
  assert.equal(toastRows.length, 153);
  assert.equal(toastRows.filter((row) => row.isAvailable).length, 126);
});

test("builds a compact current Adyar catalog without parser fragments", () => {
  assert.equal(snapshot.itemCount, 158);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, snapshot.itemCount);
  assert.equal(snapshot.items.some((item) => item.name === "ACCOMPANIMENTS"), false);
  assert.equal(snapshot.items.some((item) => item.name === "Big fluffy deep fried Indian bread served with Punjabi style spicy chick peas masala"), false);
  assert.equal(snapshot.items.some((item) => item.name === "BADHUSHA"), false);
  assert.ok(get("PANEER KHURCHAN"));
  assert.ok(get("RAVA LADDU"));
});

test("does not turn optional choices or non-wheat flours into fixed allergens", () => {
  assert.deepEqual(get("ALOO BONDA (Dinner Only)").allergens, []);
  assert.deepEqual(get("APPAM").allergens, []);
  assert.deepEqual(get("ENNAI KATHIRIKKAI KUZHAMBU").allergens, []);
  assert.deepEqual(get("VARIETY RICE (Choose from Bisi-bele-bhath / Tamarind Rice / Lemon Rice / Curd Rice)").allergens, []);
  assert.deepEqual(get("KULFI (Choose from MALAI / PISTHA / MANGO)").allergens, ["milk"]);
  assert.equal(get("KULFI (Choose from MALAI / PISTHA / MANGO)").allergens.includes("tree-nut"), false);
});

test("preserves fixed official menu signals while leaving vendor-only additions unavailable", () => {
  assert.deepEqual(get("ADAI AVIYAL (Only for Dinner)").allergens, ["milk"]);
  assert.deepEqual(get("CREAM OF TOMATO SOUP").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(get("PAV BAHJI").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(get("SOUTH INDIAN THALI").allergens, ["milk", "wheat", "gluten"]);
  assert.deepEqual(get("PANEER VEG MOMO (8 PIECES)").allergens, []);
  assert.equal(get("PANEER VEG MOMO (8 PIECES)").allergenSourceType, "unavailable");
});

test("separates packaged contains statements from facility cross-contact", () => {
  assert.deepEqual(get("ADHIRASAM").allergens, ["milk"]);
  assert.deepEqual(get("ADHIRASAM").mayContain, ["wheat", "gluten", "soy", "peanut", "tree-nut"]);
  assert.deepEqual(get("FRUIT HALWA").allergens, ["milk", "tree-nut", "wheat", "gluten"]);
  assert.deepEqual(get("FRUIT HALWA").mayContain, ["soy", "peanut"]);
  assert.deepEqual(get("SEEDAI").allergens, ["milk", "sesame"]);
  assert.equal(get("SEEDAI").allergens.includes("tree-nut"), false);
});

test("places every beverage at the end", () => {
  const firstBeverage = snapshot.items.findIndex((item) => item.category === "BEVERAGES");
  assert.ok(firstBeverage > 0);
  assert.ok(snapshot.items.slice(firstBeverage).every((item) => item.category === "BEVERAGES"));
  assert.equal(snapshot.items.slice(firstBeverage).length, 14);
});
