import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { reconcileAromaBanquetBaselineItems } from "./aroma-banquet-audit-reconciliation.mjs";

async function reconciliation() {
  const [checkText, snapshotText] = await Promise.all([
    readFile(new URL("../../data/restaurant-verification/item-checks/osm-aroma-banquet-1395623894.jsonl", import.meta.url), "utf8"),
    readFile(new URL("../../data/restaurant-verification/repairs/osm-aroma-banquet-1395623894/corrected-menu.json", import.meta.url), "utf8"),
  ]);
  const checks = checkText.trim().split(/\r?\n/).map(JSON.parse);
  return reconcileAromaBanquetBaselineItems(checks, JSON.parse(snapshotText));
}

test("reconciles every one of the 110 frozen Aroma rows exactly once", async () => {
  const result = await reconciliation();

  assert.equal(result.itemChecks.length, 110);
  assert.deepEqual(result.counts.dispositions, {
    artifact: 10,
    exact_match: 94,
    normalized_match: 1,
    stale_extra: 5,
  });
  assert.deepEqual(result.counts.allergens, {
    not_applicable: 15,
    accurately_unavailable: 32,
    verified: 46,
    mismatch: 17,
  });
  assert.equal(result.counts.matchedBaselineItemCount, 95);
  assert.equal(result.counts.matchedCurrentItemCount, 95);
  assert.equal(result.counts.artifactItemCount, 10);
  assert.equal(result.counts.staleItemCount, 5);
  assert.equal(result.counts.omittedCurrentItemCount, 4);
  assert.equal(result.counts.fixedSignalMismatchCount, 17);
  assert.equal(result.counts.provenanceMismatchCount, 10);
  assert.equal(result.counts.menuContentMismatchCount, 95);
});

test("classifies headings, events, boilerplate, and stale Wix residue", async () => {
  const result = await reconciliation();
  const byName = new Map(result.itemChecks.map((row) => [row.baseline.name, row]));

  for (const name of [
    "Get More Form Submissions",
    "Beats & Bites",
    "Perfume Making",
    "BIRYANI",
    "House Dressings",
  ]) assert.equal(byName.get(name).disposition, "artifact", name);
  for (const name of [
    "Chili Rellieno",
    "Salmon en Cilantro",
    "Seekh Kebab Taquitos",
    "Soft Tacos",
    "Spinach & Potato Taquitos",
  ]) assert.equal(byName.get(name).disposition, "stale_extra", name);

  assert.equal(byName.get("Chicken").disposition, "normalized_match");
  assert.deepEqual(byName.get("Chicken").currentItemIds, ["chicken-65"]);
});

test("identifies the four current products omitted by the frozen catalog", async () => {
  const result = await reconciliation();
  assert.deepEqual(
    result.omittedCurrentItems.map((row) => row.name),
    ["Mint & Coriander", "Tamarind", "Matter Pulao", "Gulab Jamoon"],
  );
  assert.deepEqual(result.omittedCurrentItems.at(-1).allergens, ["milk"]);
});

test("records both overreported and underreported frozen allergen signals", async () => {
  const result = await reconciliation();
  const byName = new Map(result.itemChecks.map((row) => [row.baseline.name, row]));

  for (const name of [
    "Bagara Baigan",
    "Coco Mussel Curry",
    "Gajjar Halwa",
    "Hakka Noodles",
    "Kheer",
    "Malai Kofta",
    "Sarso Ka Saag",
    "Vegetable Biryani",
  ]) assert.equal(byName.get(name).allergenVerdict, "mismatch", name);

  assert.match(byName.get("Bagara Baigan").notes, /current signals \[peanut, sesame\]/i);
  assert.match(byName.get("Coco Mussel Curry").notes, /current signals \[shellfish\]/i);
  assert.match(byName.get("Sarso Ka Saag").notes, /current signals \[none\]/i);
  assert.match(byName.get("Vegetable Biryani").notes, /current signals \[milk\]/i);
  assert.equal(result.itemChecks.every((row) => row.sourceEvidenceIds.length === 4), true);
});

test("fails closed on an unadjudicated frozen row", async () => {
  const [checkText, snapshotText] = await Promise.all([
    readFile(new URL("../../data/restaurant-verification/item-checks/osm-aroma-banquet-1395623894.jsonl", import.meta.url), "utf8"),
    readFile(new URL("../../data/restaurant-verification/repairs/osm-aroma-banquet-1395623894/corrected-menu.json", import.meta.url), "utf8"),
  ]);
  const checks = checkText.trim().split(/\r?\n/).map(JSON.parse);
  checks.find((row) => row.baseline.name === "Adraki Lamb Chops").baseline.name = "Unreviewed Product";
  assert.throws(
    () => reconcileAromaBanquetBaselineItems(checks, JSON.parse(snapshotText)),
    /unclassified Aroma Banquet frozen row/i,
  );
});
