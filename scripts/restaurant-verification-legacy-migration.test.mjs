import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { generateLegacyMigrationInventory } from "./restaurant-verification-legacy-migration.mjs";

test("legacy migration inventory is read-only and never grants automatic v2 terminal status", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "legacy-migration-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of ["restaurants", "evidence", "item-checks", "artifacts/legacy"]) {
    await mkdir(path.join(root, directory), { recursive: true });
  }
  const row = {
    restaurantId: "legacy",
    name: "Legacy",
    status: "codex_verified",
    completedAt: "2026-07-14T00:00:00.000Z",
    baseline: { itemCount: 1, itemFingerprint: "a".repeat(64) },
    paths: { dossier: "restaurants/legacy.json", evidence: "evidence/legacy.json", itemChecks: "item-checks/legacy.jsonl" },
  };
  const ledgerContents = `${JSON.stringify(row)}\n`;
  await writeFile(path.join(root, "ledger.jsonl"), ledgerContents);
  await writeFile(path.join(root, "restaurants/legacy.json"), JSON.stringify({ restaurantId: "legacy", status: "codex_verified" }));
  const artifact = Buffer.from("official menu");
  await writeFile(path.join(root, "artifacts/legacy/menu.html"), artifact);
  await writeFile(path.join(root, "evidence/legacy.json"), JSON.stringify({
    restaurantId: "legacy",
    sources: [{
      id: "menu",
      authorityTier: "restaurant_issued",
      artifactPath: "artifacts/legacy/menu.html",
      sha256: "682b2dc65b3b7e3638b331e9722c4459c8067d0f16dea73511538b533e525ed5",
    }],
  }));
  await writeFile(path.join(root, "item-checks/legacy.jsonl"), `${JSON.stringify({
    auditItemKey: "1:item",
    disposition: "exact_match",
    allergenVerdict: "verified",
  })}\n`);

  const before = await readFile(path.join(root, "ledger.jsonl"), "utf8");
  const inventory = await generateLegacyMigrationInventory({ root, now: "2026-07-15T00:00:00.000Z" });
  assert.equal(inventory.summary.legacyTerminalCount, 1);
  assert.equal(inventory.summary.automaticTerminalUpgradeCount, 0);
  assert.equal(inventory.records[0].eligibleForAutomaticTerminalUpgrade, false);
  assert.equal(inventory.records[0].retainedEvidence.artifactVerifiedCount, 1);
  assert.ok(inventory.records[0].gapCodes.includes("missing_v2_hashed_worker_handoff"));
  assert.ok(inventory.records[0].gapCodes.includes("missing_structured_item_allergen_arrays"));
  assert.equal(await readFile(path.join(root, "ledger.jsonl"), "utf8"), before);
  assert.match(await readFile(path.join(root, "legacy-migration/inventory.md"), "utf8"), /Automatic terminal upgrades: 0/);
});
