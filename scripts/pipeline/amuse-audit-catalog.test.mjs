import assert from "node:assert/strict";
import test from "node:test";

import { buildAmuseAuditSnapshot } from "./amuse-audit-catalog.mjs";

test("represents Amuse as temporarily closed with no current menu", () => {
  const snapshot = buildAmuseAuditSnapshot({ retrievedAt: "2026-07-15T05:03:43.331Z" });

  assert.equal(snapshot.restaurantId, "osm-amuse-3396064825");
  assert.equal(snapshot.locationStatus, "temporarily_closed_for_renovation");
  assert.equal(snapshot.itemCount, 0);
  assert.equal(snapshot.presentationCount, 0);
  assert.deepEqual(snapshot.items, []);
  assert.match(snapshot.sourceWarning, /temporarily closed for renovation/i);
  assert.match(snapshot.sourceWarning, /old Amuse hours/i);
  assert.match(snapshot.sourceWarning, /no current operating menu/i);
  assert.match(snapshot.sourceWarning, /must not be parsed together/i);
});
