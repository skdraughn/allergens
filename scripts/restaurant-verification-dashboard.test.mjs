import assert from "node:assert/strict";
import test from "node:test";

import {
  escapeHtml,
  renderDashboard,
  summarizeDashboardState,
} from "./restaurant-verification-dashboard.mjs";

const now = new Date("2026-07-16T20:00:00.000Z");
const rows = [
  ledgerRow("a", "Alpha", "codex_verified", "2026-07-16T19:40:00.000Z", "2026-07-16T19:30:00.000Z"),
  ledgerRow("b", "Beta", "discrepancy_found", null, "2026-07-16T19:35:00.000Z"),
  ledgerRow("c", "Cafe <One>", "repair_in_progress", null, "2026-07-16T19:34:00.000Z"),
  ledgerRow("d", "Delta", "pending", null, "2026-07-16T19:33:00.000Z"),
];

test("summarizes ledger outcomes, pace, and the exception-first queue", () => {
  const state = summarizeDashboardState({
    rows,
    manifests: [],
    ledgerStat: { mtime: new Date("2026-07-16T19:59:00.000Z") },
    now,
  });
  assert.equal(state.total, 4);
  assert.equal(state.passed, 1);
  assert.equal(state.failed, 1);
  assert.equal(state.repair, 1);
  assert.equal(state.pending, 1);
  assert.equal(state.pace.lastHour, 1);
  assert.equal(state.nextRows[0].restaurantId, "c");
  assert.equal(state.nextRows[1].restaurantId, "b");
  assert.equal(state.ledgerFresh, true);
  assert.equal(state.runningJobCount, 0);
});

test("renders a self-refreshing, escaped human-readable page", () => {
  const state = summarizeDashboardState({
    rows,
    manifests: [],
    ledgerStat: { mtime: new Date("2026-07-16T19:59:00.000Z") },
    now,
  });
  const html = renderDashboard(state, { refreshSeconds: 5 });
  assert.match(html, /http-equiv="refresh" content="5"/);
  assert.match(html, /Exact subagent process/);
  assert.match(html, /Cafe &lt;One&gt;/);
  assert.doesNotMatch(html, /Cafe <One>/);
});

test("escapes every unsafe HTML character", () => {
  assert.equal(escapeHtml(`<a href='x'>&"`), "&lt;a href=&#39;x&#39;&gt;&amp;&quot;");
});

function ledgerRow(restaurantId, name, status, completedAt, updatedAt) {
  return {
    restaurantId,
    name,
    status,
    claimedAt: completedAt ? "2026-07-16T19:00:00.000Z" : null,
    completedAt,
    updatedAt,
    rank: restaurantId.charCodeAt(0),
    locationId: "dc-metro",
    baseline: { itemCount: 10 },
  };
}
