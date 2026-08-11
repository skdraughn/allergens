import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  build1983AuditSnapshot,
  parse1983OfficialHome,
  parse1983ToastMarkdown,
} from "./1983-chinese-cuisine-audit-catalog.mjs";

const artifactRoot =
  "data/restaurant-verification/artifacts/osm-1983-chinese-cuisine-10746777097";
const [toastMarkdown, officialHtml] = await Promise.all([
  readFile(`${artifactRoot}/third-party-toast-render-proxy.txt`, "utf8"),
  readFile(`${artifactRoot}/official-home.html`, "utf8"),
]);

test("parses every visible current menu row and its real section", () => {
  const toastRows = parse1983ToastMarkdown(toastMarkdown);
  const officialRows = parse1983OfficialHome(officialHtml);

  assert.equal(toastRows.length, 225);
  assert.equal(officialRows.length, 95);
  assert.ok(toastRows.some((row) => row.name === "Steam Rice" && row.category === "Side"));
  assert.ok(toastRows.some((row) => row.name === "Thai Tea" && row.category === "Beverages"));
  assert.ok(officialRows.some((row) => row.name === "King Crab" && row.category === "Special Menu"));
});

test("builds a deduplicated current catalog with beverages last", () => {
  const snapshot = build1983AuditSnapshot({
    toastMarkdown,
    officialHtml,
    retrievedAt: "2026-07-14T18:00:00.000Z",
  });

  assert.equal(snapshot.itemCount, 169);
  assert.equal(new Set(snapshot.items.map((item) => item.auditItemKey)).size, snapshot.itemCount);
  assert.ok(snapshot.items.every((item) => item.category !== "chinese"));
  assert.equal(snapshot.items.at(-1).category, "Beverages");
  assert.equal(snapshot.items.find((item) => item.name === "Coconut Jelly Cake").category, "Dessert");
  assert.equal(snapshot.items.filter((item) => item.name === "Pan Fried Lamb Chop").length, 1);
  assert.equal(snapshot.items.filter((item) => item.name === "Soft Crab Salt&Pepper/X.O Sauce").length, 1);
});

test("keeps only explicit, source-backed allergen signals", () => {
  const snapshot = build1983AuditSnapshot({ toastMarkdown, officialHtml });
  const item = (name) => snapshot.items.find((entry) => entry.name === name);

  assert.deepEqual(item("Conch Soup").allergens, ["shellfish"]);
  assert.deepEqual(item("Salt & Pepper Squid").allergens, ["shellfish"]);
  assert.deepEqual(item("Silk-Stocking Milk Tea").allergens, ["milk"]);
  assert.deepEqual(item("Thai Tea").allergens, ["milk"]);
  assert.deepEqual(item("Soy Sauce Yellow Croaker").allergens, ["fish", "soy"]);
  assert.deepEqual(item("Sliced Grouper with Green Sichuan Peppercorn").allergens, ["fish"]);
  assert.deepEqual(item("Coconut Jelly Cake").allergens, []);
  assert.deepEqual(item("Matcha Mille Crepe Cake").allergens, []);
  assert.deepEqual(item("Pork Intestine w/ Pickled Mustard Green").allergens, []);
  assert.deepEqual(item("Soy Milk").allergens, ["soy"]);
});
