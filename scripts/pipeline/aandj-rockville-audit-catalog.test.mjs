import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildAandJRockvilleAuditSnapshot,
  parseAandJRockvilleToastMenu,
} from "./aandj-rockville-audit-catalog.mjs";
import { parseAandJOfficialMenu } from "./aandj-audit-catalog.mjs";

const restaurantId = "osm-aandj-s-northern-chinese-dim-sum-633639009";
const [officialMenuHtml, toastMarkdown] = await Promise.all([
  readFile(`data/restaurant-verification/artifacts/${restaurantId}/official-menu.html`, "utf8"),
  readFile(`data/restaurant-verification/artifacts/${restaurantId}/third-party-rockville-toast-render-proxy.txt`, "utf8"),
]);
const snapshot = buildAandJRockvilleAuditSnapshot({ officialMenuHtml, toastMarkdown });

test("reconstructs the complete compact current A&J Rockville menu", () => {
  const toastRows = parseAandJRockvilleToastMenu(toastMarkdown);
  assert.equal(parseAandJOfficialMenu(officialMenuHtml).length, 67);
  assert.equal(toastRows.length, 79);
  assert.equal(toastRows.filter((item) => item.isAvailable).length, 75);
  assert.equal(snapshot.itemCount, 78);
  assert.equal(snapshot.items.filter((item) => item.sourceType === "restaurant-issued-structured-menu").length, 67);
  assert.equal(snapshot.items.filter((item) => item.sourceType === "restaurant-linked-vendor-menu").length, 11);
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 78);
  assert.equal(new Set(snapshot.items.map((item) => item.category)).size, 9);
});

test("retains full official descriptions and Chinese-titled drinks", () => {
  const get = (category, name) => snapshot.items.find((item) => item.category === category && item.name === name);
  assert.equal(get("NOODLES", "乾拌牛肉麵 Gan Ban Niu Rou Mian").description, "Spicy Noodle w/Sliced Beef");
  assert.equal(get("BUNS // DUMPLINGS // BREADS", "牛肉燒餅 Niu Rou Shao Bing").description, "Chinese Sesame Biscuit w/ Sliced Beef");
  assert.equal(get("DRINKS", "雪碧汽水").description, "Sprite");
  assert.equal(get("DRINKS", "可口可樂").description, "Coca Cola");
  assert.equal(get("DRINKS", "礦泉水").description, "Mineral Water");
  assert.equal(get("DRINKS", "珍珠飲料 Bubble Tea").isConfigurable, true);
});

test("excludes duplicate placements, out-of-stock rows, and redundant Bubble Tea SKUs", () => {
  const names = new Set(snapshot.items.map((item) => item.name));
  assert.equal(names.has("餛飩麵 Wonton Noodle"), true);
  assert.equal(names.has("青菜 Vegetable"), true);
  assert.equal(names.has("可樂 Diet Coke"), false);
  assert.equal(names.has("Coffee Bubble Tea珍珠咖啡"), false);
  assert.equal(snapshot.items.filter((item) => item.sourceItemId === "2207-vegetable").length, 1);
  assert.equal(snapshot.items.some((item) => /OUT OF STOCK/i.test(`${item.name} ${item.description}`)), false);
});

test("derives only fixed restaurant-published allergen signals", () => {
  const get = (category, name) => snapshot.items.find((item) => item.category === category && item.name === name);
  assert.deepEqual(get("NOODLES", "擔擔麵 Dan Dan Mian").allergens, ["peanut", "sesame", "wheat", "gluten"]);
  assert.deepEqual(get("NOODLES", "涼麵 Liang Mian").allergens, ["egg", "wheat", "gluten"]);
  assert.deepEqual(get("RICE", "烤麩飯 Kao Fu Cai Fan").allergens, ["soy", "wheat", "gluten"]);
  assert.deepEqual(get("COLD PLATES", "雞絲拉皮 Ji Si La Pi").allergens, ["sesame", "mustard"]);
  assert.deepEqual(get("COLD PLATES", "毛豆百頁 Mao Do Bai Ye").allergens, ["soy"]);
  assert.deepEqual(get("COLD PLATES", "香菜豆干 Xiang Cai Dou Gan").allergens, ["peanut", "soy"]);
  assert.deepEqual(get("DRINKS", "珍珠飲料 Bubble Tea").allergens, []);
});

test("places beverages after every food category", () => {
  const firstDrink = snapshot.items.findIndex((item) => item.category === "DRINKS");
  assert.ok(firstDrink > 0);
  assert.ok(snapshot.items.slice(firstDrink).every((item) => item.category === "DRINKS"));
});
