import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildAnnabelleAuditSnapshot,
  publishedSignalsAnnabelle,
} from "./annabelle-audit-catalog.mjs";

const artifactRoot = new URL("../../data/restaurant-verification/artifacts/annabelle-dc/", import.meta.url);

test("parses Annabelle's dated dinner and current bar menus", async () => {
  const [dinnerHtml, barHtml] = await Promise.all([
    readFile(new URL("official-annabelle-dinner-dessert.html", artifactRoot), "utf8"),
    readFile(new URL("official-annabelle-bar-bites.html", artifactRoot), "utf8"),
  ]);
  const snapshot = buildAnnabelleAuditSnapshot({ dinnerHtml, barHtml });
  assert.equal(snapshot.itemCount, 33);
  assert.equal(snapshot.dinnerItemCount, 27);
  assert.equal(snapshot.barItemCount, 6);
  assert.equal(snapshot.categoryCount, 6);
  assert.ok(snapshot.items.some((item) => item.name === "Seasonal Vegetable Tempura"));
  assert.ok(!snapshot.items.some((item) => item.name === "Tentsuyu Sauce"));

  const prime = snapshot.items.find((item) => item.name === "Prime Angus Teres Major");
  assert.ok(prime.allergens.includes("milk"));
  assert.ok(!prime.allergens.includes("shellfish"));
  const broccolini = snapshot.items.find((item) => item.name === "Crispy Broccolini");
  assert.deepEqual(broccolini.allergens, ["tree-nut"]);
  const snapper = snapshot.items.find((item) => item.name === "Snapper");
  assert.deepEqual(snapper.allergens.sort(), ["fish", "shellfish"]);
  const trio = snapshot.items.find((item) => item.name === "Trio of Sorbet");
  assert.ok(trio.allergens.includes("milk"));
  assert.ok(trio.allergens.includes("gluten"));
});

test("protects ingredient substrings from false positive allergen mappings", () => {
  assert.deepEqual(publishedSignalsAnnabelle({
    name: "Steak",
    description: "oyster mushrooms, cashew cream, coconut bisque",
    labels: [],
  }), ["tree-nut"]);
});
