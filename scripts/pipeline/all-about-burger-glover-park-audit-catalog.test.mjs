import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAllAboutBurgerGloverParkAuditSnapshot } from "./all-about-burger-glover-park-audit-catalog.mjs";

const snapshot = buildAllAboutBurgerGloverParkAuditSnapshot({ retrievedAt: "2026-07-14T00:00:00.000Z" });

test("represents the closed and replaced location with no current menu", () => {
  assert.equal(snapshot.locationStatus, "closed_and_replaced");
  assert.equal(snapshot.itemCount, 0);
  assert.equal(snapshot.presentationCount, 0);
  assert.deepEqual(snapshot.items, []);
});

test("pins the three independent current-state artifacts", async () => {
  const sources = [
    ["official-current-menu-locations.html", "dfdb6cb5d0eac22a67ac082661ac08ace63c3d837299e364d425b44f0452c46e"],
    ["local-closure-report.html", "131bed3879f0a9c5d4472098555d3fa0c3decb9ca98514de29922ea434cfe946"],
    ["current-tenant-official-site.html", "4d694dbcc48942cbf63be1e5e93ead06da6ac92a551002eadd29a02f37fb1fa7"],
  ];
  for (const [filename, expectedHash] of sources) {
    const content = await readFile(`data/restaurant-verification/artifacts/all-about-burger-glover-park-dc/${filename}`);
    assert.equal(createHash("sha256").update(content).digest("hex"), expectedHash, filename);
  }
});
