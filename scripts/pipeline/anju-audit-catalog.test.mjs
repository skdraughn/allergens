import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildAnjuAuditSnapshot,
  parseAnjuMenuPage,
  publishedSignalsAnju,
  sourceUrlsAnju,
} from "./anju-audit-catalog.mjs";

const artifactRoot = new URL("../../data/restaurant-verification/artifacts/anju-dc/", import.meta.url);

test("parses the frozen current Anju menu surfaces without price or modifier artifacts", async () => {
  const [dinnerHtml, brunchHtml, happyHourHtml] = await Promise.all([
    readFile(new URL("official-anju-dinner.html", artifactRoot), "utf8"),
    readFile(new URL("official-anju-brunch.html", artifactRoot), "utf8"),
    readFile(new URL("official-anju-happy-hour.html", artifactRoot), "utf8"),
  ]);
  const snapshot = buildAnjuAuditSnapshot({
    dinnerHtml,
    brunchHtml,
    happyHourHtml,
    retrievedAt: "2026-07-15T06:02:24.000Z",
  });

  assert.equal(snapshot.presentationCount, 51);
  assert.equal(snapshot.itemCount, 49);
  assert.equal(snapshot.dinnerPresentationCount, 26);
  assert.equal(snapshot.brunchPresentationCount, 18);
  assert.equal(snapshot.happyHourPresentationCount, 7);
  assert.equal(snapshot.excludedModifierCount, 13);
  assert.equal(snapshot.excludedAlcoholCount, 9);
  assert.equal(snapshot.items.at(-1).category, "Beverages");
  assert.equal(snapshot.items.filter((item) => item.name === "Mandu").length, 1);
  assert.equal(snapshot.items.filter((item) => item.name === "Yache Mandu").length, 1);
  assert.ok(!snapshot.items.some((item) => /optional sub impossible|with tito|with chambord/i.test(item.name)));
  assert.ok(!snapshot.items.some((item) => ["Cinnamon Toast Punch", "Peach Perfect", "Korea-Jillo"].includes(item.name)));

  const palace = snapshot.items.find((item) => item.name === "Palace Ddukbokgi");
  assert.deepEqual(palace.allergens, ["soy"]);
  const mandu = snapshot.items.find((item) => item.name === "Mandu");
  assert.deepEqual(mandu.allergens.sort(), ["shellfish", "soy"]);
  assert.ok(mandu.sourceUrls.includes(sourceUrlsAnju.toastOrder));
  const eomuk = snapshot.items.find((item) => item.name === "Eomuk");
  assert.deepEqual(eomuk.allergens, ["fish"]);
  const jjampong = snapshot.items.find((item) => item.name === "Jjampong");
  assert.deepEqual(jjampong.allergens.sort(), ["gluten", "shellfish", "wheat"]);
});

test("keeps fish-shaped language from becoming fish and preserves ambiguous nuts as unavailable", () => {
  assert.deepEqual(
    publishedSignalsAnju({
      name: "Fish-Shaped Waffle",
      description: "raspberry jam and lemon gelato",
    }),
    ["milk", "wheat", "gluten"],
  );
  assert.deepEqual(
    publishedSignalsAnju({
      name: "Ramyun-Spiced Nuts",
      description: "house-made toasted nut mix seasoned with savory ramyun spices",
    }),
    [],
  );
});

test("classifies happy-hour food separately from alcohol", () => {
  const html = `
    <div class="sqs-html-content">
      <p>FOOD</p><p>Mandu | $6</p><p>pork dumplings</p>
      <p>DRINKS</p><p>Shandy | $7</p><p>beer and soju</p>
    </div>`;
  const result = parseAnjuMenuPage(html, {
    menuKind: "happy-hour",
    sourceUrl: sourceUrlsAnju.happyHour,
  });
  assert.deepEqual(result.rows.map((row) => row.name), ["Mandu"]);
  assert.deepEqual(result.excludedAlcohol.map((row) => row.name), ["Shandy"]);
});
