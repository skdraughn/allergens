import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { extractAsiaGardenMenuPayload } from "./asia-garden-audit-catalog.mjs";
import { reconcileAsiaGardenBaselineItems } from "./asia-garden-audit-reconciliation.mjs";

test("classifies every frozen Asia Garden description and badge row as an artifact", async () => {
  const [checksText, snapshotText, sourceHtml] = await Promise.all([
    readFile(new URL("../../data/restaurant-verification/item-checks/osm-asia-garden-11366360044.jsonl", import.meta.url), "utf8"),
    readFile(new URL("../../data/restaurant-verification/repairs/osm-asia-garden-11366360044/corrected-menu.json", import.meta.url), "utf8"),
    readFile(new URL("../../data/restaurant-verification/artifacts/osm-asia-garden-11366360044/official-all-day-menu.html", import.meta.url), "utf8"),
  ]);
  const result = reconcileAsiaGardenBaselineItems(
    checksText.trim().split(/\r?\n/).map(JSON.parse),
    JSON.parse(snapshotText),
    extractAsiaGardenMenuPayload(sourceHtml),
  );

  assert.equal(result.itemChecks.length, 22);
  assert.deepEqual(result.counts.dispositions, { artifact: 22 });
  assert.deepEqual(result.counts.allergens, { not_applicable: 22 });
  assert.equal(result.counts.current.itemCount, 242);
  assert.equal(result.counts.current.matchedItemCount, 0);
  assert.equal(result.counts.current.missingItemCount, 242);
  assert.equal(result.counts.mismatchKinds.artifact, 22);
  assert.equal(result.counts.mismatchKinds.frozenSpuriousOfficialIngredientArtifact, 7);

  const byBaselineName = new Map(result.itemChecks.map((item) => [item.baseline.name, item]));
  assert.match(byBaselineName.get("POPULAR").notes, /recommendation badge/);
  assert.match(byBaselineName.get("OFTEN LIKED").notes, /recommendation badge/);
  assert.match(byBaselineName.get("Crispy fried jumbo shrimp served hot and golden").notes, /Fried Jumbo Shrimp/);
  assert.match(byBaselineName.get("Crispy fried chicken tossed in a sweet and spicy sesame sauce").notes, /4 real current presentations/);
  assert.equal(byBaselineName.get("Tender shrimp tossed in a rich garlic sauce").allergenVerdict, "not_applicable");
});
