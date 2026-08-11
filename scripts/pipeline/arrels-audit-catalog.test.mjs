import assert from "node:assert/strict";
import test from "node:test";

import { buildArrelsAuditSnapshot } from "./arrels-audit-catalog.mjs";

test("represents Arrels as permanently closed without adopting the replacement menu", () => {
  const snapshot = buildArrelsAuditSnapshot();

  assert.equal(snapshot.restaurantId, "arrels-dc");
  assert.equal(snapshot.locationStatus, "permanently_closed");
  assert.equal(snapshot.replacementStatus, "transitional_breakfast_service");
  assert.equal(snapshot.itemCount, 0);
  assert.equal(snapshot.presentationCount, 0);
  assert.deepEqual(snapshot.items, []);
  assert.match(snapshot.sourceWarning, /permanently closed in late March 2026/i);
  assert.match(snapshot.sourceWarning, /belongs to that transitional replacement service, not Arrels/i);
  assert.match(snapshot.sourceWarning, /standalone Arrels menu is stale/i);
  assert.match(snapshot.sourceWarning, /No current Arrels menu/i);
});
