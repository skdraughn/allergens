import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  reconcileAventinoDuplicate,
  reconcileAventinoKeeper,
} from "./aventino-audit-reconciliation.mjs";

const snapshot = JSON.parse(await readFile(
  "data/restaurant-verification/repairs/aventino-bethesda/corrected-menu.json",
  "utf8",
));
async function checks(id) {
  return (await readFile(`data/restaurant-verification/item-checks/${id}.jsonl`, "utf8"))
    .trim().split(/\r?\n/).map(JSON.parse);
}

test("reconciles every frozen canonical Aventino row", async () => {
  const result = reconcileAventinoKeeper(await checks("aventino-bethesda"), snapshot);
  assert.deepEqual(result.counts.dispositions, {
    stale_extra: 3,
    exact_match: 44,
    normalized_match: 1,
    artifact: 7,
  });
  assert.deepEqual(result.counts.allergens, {
    not_applicable: 10,
    verified: 20,
    accurately_unavailable: 8,
    mismatch: 17,
  });
});

test("reconciles the duplicate record into the canonical restaurant", async () => {
  const result = reconcileAventinoDuplicate(
    await checks("osm-aventino-cucina-romana-12342520793"),
    snapshot,
  );
  assert.deepEqual(result.counts.dispositions, {
    stale_extra: 1,
    exact_match: 15,
    artifact: 2,
    normalized_match: 1,
  });
  assert.deepEqual(result.counts.allergens, {
    not_applicable: 3,
    mismatch: 5,
    verified: 9,
    accurately_unavailable: 2,
  });
});
