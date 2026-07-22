#!/usr/bin/env node

import { createServer } from "node:http";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const defaultRoot = path.join(repositoryRoot, "data/restaurant-verification");
const defaultOutput = path.join(repositoryRoot, "tmp/restaurant-verification-dashboard.html");
const terminalStatuses = new Set(["codex_verified", "blocked_unverifiable"]);
const activeJobStatuses = new Set([
  "planned",
  "luna_running",
  "awaiting_luna_retry",
  "luna_failed",
  "awaiting_coordinator",
  "luna_fix",
  "apply_running",
  "awaiting_sol",
  "sol_running",
  "awaiting_sol_retry",
]);

export async function readDashboardState({ root = defaultRoot, now = new Date() } = {}) {
  const ledgerPath = path.join(root, "ledger.jsonl");
  const [ledgerText, ledgerStat, manifests] = await Promise.all([
    readFile(ledgerPath, "utf8"),
    stat(ledgerPath),
    readManifests(path.join(root, "worker-runs")),
  ]);
  const rows = ledgerText
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid ledger JSON on line ${index + 1}: ${error.message}`);
      }
    });
  return summarizeDashboardState({ rows, manifests, ledgerStat, now });
}

export function summarizeDashboardState({ rows, manifests = [], ledgerStat, now = new Date() }) {
  const nowMs = now.getTime();
  const counts = Object.create(null);
  for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;

  const passed = counts.codex_verified ?? 0;
  const failed = (counts.discrepancy_found ?? 0) +
    (counts.recheck_required ?? 0) +
    (counts.blocked_unverifiable ?? 0);
  const repair = counts.repair_in_progress ?? 0;
  const pending = counts.pending ?? 0;
  const terminal = rows.filter((row) => terminalStatuses.has(row.status)).length;
  const completedTimes = rows
    .map((row) => Date.parse(row.completedAt))
    .filter(Number.isFinite);
  const completionDurations = rows
    .map((row) => Date.parse(row.completedAt) - Date.parse(row.claimedAt))
    .filter((duration) => Number.isFinite(duration) && duration >= 0);
  const completedWithin = (hours) => completedTimes.filter((time) => nowMs - time <= hours * 3_600_000 && nowMs >= time).length;
  const last24Hours = completedWithin(24);
  const remaining = Math.max(0, rows.length - terminal);
  const hourlyRate24 = last24Hours / 24;

  const statusPriority = new Map([
    ["repair_in_progress", 0],
    ["recheck_required", 1],
    ["discrepancy_found", 2],
    ["pending", 3],
  ]);
  const nextRows = rows
    .filter((row) => statusPriority.has(row.status))
    .sort((a, b) => {
      const statusOrder = statusPriority.get(a.status) - statusPriority.get(b.status);
      return statusOrder || (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER);
    })
    .slice(0, 8);

  const jobs = manifests
    .flatMap((manifest) => (manifest.jobs ?? []).map((job) => ({
      ...job,
      runId: manifest.runId,
      runStatus: manifest.status,
      runUpdatedAt: manifest.updatedAt ?? manifest.createdAt,
      workflow: manifest.models?.verifier?.id ? "legacy_three_tier" : "poc",
    })))
    .filter((job) => activeJobStatuses.has(job.status))
    .sort((a, b) => Date.parse(b.runUpdatedAt) - Date.parse(a.runUpdatedAt));

  const recent = [...rows]
    .filter((row) => row.updatedAt)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 12);
  const ledgerUpdatedAt = ledgerStat?.mtime?.toISOString?.() ?? null;
  const ledgerAgeMs = ledgerUpdatedAt ? nowMs - Date.parse(ledgerUpdatedAt) : null;

  return {
    generatedAt: now.toISOString(),
    ledgerUpdatedAt,
    ledgerFresh: ledgerAgeMs !== null && ledgerAgeMs < 5 * 60_000,
    total: rows.length,
    counts,
    passed,
    failed,
    repair,
    pending,
    terminal,
    remaining,
    completionPercent: rows.length ? (terminal / rows.length) * 100 : 0,
    pace: {
      lastHour: completedWithin(1),
      last6Hours: completedWithin(6),
      last24Hours,
      hourlyRate24,
      medianMinutes: median(completionDurations) / 60_000,
      etaHours: hourlyRate24 > 0 ? remaining / hourlyRate24 : null,
    },
    nextRows,
    activeJobs: jobs.slice(0, 30),
    activeJobCount: jobs.length,
    runningJobCount: jobs.filter((job) => job.status.endsWith("_running")).length,
    manifests: manifests.length,
    recent,
  };
}

export function renderDashboard(state, { refreshSeconds = 3 } = {}) {
  const rows = state.recent.map((row) => `
    <tr>
      <td><strong>${escapeHtml(row.name)}</strong><span class="sub">${escapeHtml(row.restaurantId)}</span></td>
      <td>${statusPill(row.status)}</td>
      <td>${formatWhen(row.updatedAt)}</td>
      <td>${formatInteger(row.baseline?.itemCount ?? 0)}</td>
    </tr>`).join("");
  const activeJobs = state.activeJobs.length
    ? state.activeJobs.map((job) => `
      <tr>
        <td><strong>${escapeHtml(job.name ?? job.restaurantId)}</strong><span class="sub">${escapeHtml(job.runId)}</span></td>
        <td>${statusPill(job.status)}</td>
        <td>${escapeHtml(job.workflow === "legacy_three_tier" ? "Legacy" : "POC")}</td>
        <td>${formatWhen(job.runUpdatedAt)}</td>
      </tr>`).join("")
    : `<tr><td colspan="4" class="empty">No worker jobs are currently active.</td></tr>`;
  const queue = state.nextRows.map((row, index) => `
    <li><span class="queue-index">${index + 1}</span><span><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.status)} &middot; ${escapeHtml(row.locationId ?? "unknown location")}</small></span></li>`).join("");
  const statusBars = Object.entries(state.counts)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => `<div class="status-row"><span>${escapeHtml(status)}</span><div><i style="width:${Math.max(2, count / state.total * 100)}%"></i></div><strong>${formatInteger(count)}</strong></div>`)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="refresh" content="${Math.max(1, Number(refreshSeconds) || 3)}">
  <title>SafePlate verification live</title>
  <style>
    :root{--ink:#17201b;--muted:#667169;--line:#dfe6e1;--paper:#f7f9f7;--white:#fff;--green:#277553;--green-soft:#e4f2ea;--orange:#b55b16;--orange-soft:#fff0df;--red:#aa3c35;--red-soft:#fbe8e6;--blue:#356d91;--blue-soft:#e7f1f7}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0}main{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:28px 0 56px}header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding-bottom:22px;border-bottom:1px solid var(--line)}h1{margin:0;font-size:28px;line-height:1.15;letter-spacing:0}h2{margin:0 0 12px;font-size:17px;letter-spacing:0}p{margin:5px 0 0;color:var(--muted)}.live{display:flex;align-items:center;gap:8px;white-space:nowrap;color:var(--muted)}.live i{width:8px;height:8px;border-radius:50%;background:${state.ledgerFresh ? "#35a269" : "#d18b31"};box-shadow:0 0 0 4px ${state.ledgerFresh ? "#dff3e8" : "#fff0dc"}}.stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;padding:18px 0}.stat,.panel{background:var(--white);border:1px solid var(--line);border-radius:8px}.stat{padding:14px}.stat strong{display:block;font-size:25px;line-height:1.1}.stat span{display:block;margin-top:6px;color:var(--muted);font-size:12px}.progress{height:8px;background:#e7ebe8;border-radius:4px;overflow:hidden}.progress i{display:block;height:100%;background:var(--green);border-radius:4px}.layout{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(290px,.7fr);gap:14px}.layout>div,.layout>aside{min-width:0}.panel{padding:16px;margin-bottom:14px;overflow:hidden}.panel-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:4px 12px}.panel-head span{color:var(--muted);font-size:12px}.pace{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px}.pace div{padding:10px;background:#f3f6f3;border-radius:6px}.pace strong{display:block;font-size:18px}.pace span{color:var(--muted);font-size:11px}.status-row{display:grid;grid-template-columns:150px 1fr 45px;align-items:center;gap:9px;margin:9px 0}.status-row span{color:var(--muted);font-size:12px;overflow:hidden;text-overflow:ellipsis}.status-row div{height:6px;background:#edf0ed;border-radius:3px;overflow:hidden}.status-row i{display:block;height:100%;background:var(--blue)}.status-row strong{text-align:right;font-size:12px}.queue{list-style:none;margin:0;padding:0}.queue li{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-top:1px solid var(--line)}.queue li:first-child{border-top:0}.queue-index{display:grid;place-items:center;width:24px;height:24px;flex:0 0 24px;border-radius:50%;background:var(--green-soft);color:var(--green);font-weight:700}.queue small,.sub{display:block;color:var(--muted);font-size:11px;margin-top:2px;overflow-wrap:anywhere}.protocol{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;counter-reset:step}.step{position:relative;padding:12px 12px 12px 42px;border:1px solid var(--line);border-radius:7px;background:#fbfcfb;min-height:76px}.step:before{counter-increment:step;content:counter(step);position:absolute;left:12px;top:12px;display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--ink);color:white;font-size:11px;font-weight:700}.step strong{display:block;font-size:13px}.step span{display:block;margin-top:3px;color:var(--muted);font-size:11px}.phase{grid-column:1/-1;margin-top:6px;color:var(--green);font-size:11px;font-weight:700;text-transform:uppercase}.table-wrap{max-width:100%;overflow:auto}table{width:100%;border-collapse:collapse;min-width:620px}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-size:11px;font-weight:600;text-transform:uppercase}td{font-size:12px}.pill{display:inline-block;padding:3px 7px;border-radius:999px;background:var(--blue-soft);color:var(--blue);font-size:10px;font-weight:700;white-space:nowrap}.pill.good{background:var(--green-soft);color:var(--green)}.pill.warn{background:var(--orange-soft);color:var(--orange)}.pill.bad{background:var(--red-soft);color:var(--red)}.empty{padding:22px;text-align:center;color:var(--muted)}footer{padding-top:8px;color:var(--muted);font-size:11px}@media(max-width:850px){.stats{grid-template-columns:repeat(2,1fr)}.layout{grid-template-columns:1fr}.protocol{grid-template-columns:1fr}.phase{grid-column:auto}.status-row{grid-template-columns:120px 1fr 40px}}@media(max-width:520px){main{width:min(100% - 20px,1180px);padding-top:18px}header{display:block}.live{margin-top:12px}.stats{grid-template-columns:1fr 1fr}.pace{grid-template-columns:1fr 1fr}h1{font-size:24px}}
  </style>
</head>
<body>
<main>
  <header><div><h1>SafePlate verification ledger</h1><p>Human-readable view of the canonical ledger and worker run manifests.</p></div><div class="live"><i></i>Refreshes every ${refreshSeconds}s &middot; ${state.ledgerFresh ? "ledger recently changed" : "no recent ledger write"}</div></header>
  <section class="stats">
    <div class="stat"><strong>${formatInteger(state.total)}</strong><span>Total restaurants</span></div>
    <div class="stat"><strong>${formatInteger(state.passed)}</strong><span>Passed / codex verified</span></div>
    <div class="stat"><strong>${formatInteger(state.failed)}</strong><span>Failed or needs recheck</span></div>
    <div class="stat"><strong>${formatInteger(state.repair)}</strong><span>Repair in progress</span></div>
    <div class="stat"><strong>${formatInteger(state.pending)}</strong><span>Pending</span></div>
  </section>
  <section class="panel"><div class="panel-head"><h2>Terminal progress</h2><span>${state.completionPercent.toFixed(1)}%</span></div><div class="progress"><i style="width:${state.completionPercent}%"></i></div><div class="pace"><div><strong>${state.pace.lastHour}</strong><span>completed in 1 hour</span></div><div><strong>${state.pace.last6Hours}</strong><span>completed in 6 hours</span></div><div><strong>${state.pace.last24Hours}</strong><span>completed in 24 hours</span></div><div><strong>${state.ledgerFresh ? formatEta(state.pace.etaHours) : "Paused"}</strong><span>ETA at 24h pace</span></div></div></section>
  <div class="layout"><div>
    <section class="panel"><div class="panel-head"><h2>Exact subagent process</h2><span>One restaurant per Luna worker</span></div><div class="protocol">
      <div class="phase">Read-only research</div>
      ${protocolStep("Validate packet", "Match restaurant, location, fingerprint, and every frozen item key. Stop on mismatch.")}
      ${protocolStep("Confirm identity", "Verify the official business, location, domain, and homepage. Never merge ambiguity.")}
      ${protocolStep("Inventory menus", "Enumerate current HTML, PDFs, images, service periods, location pages, and linked vendors.")}
      ${protocolStep("Build products", "Define the current POC product set and consolidate equivalent presentations with references.")}
      ${protocolStep("Search allergen sources", "Run official site, official documents, linked vendor, then targeted web search. Log all four.")}
      ${protocolStep("Apply direct evidence", "Preserve sourced positives and cross-contact claims. Missing disclosure stays unavailable.")}
      ${protocolStep("Reconcile every item", "Map every frozen key exactly once. No omissions and no duplicate reconciliation rows.")}
      ${protocolStep("Write isolated result", "Return sources, products, search audit, reconciliation, repair signals, and conflicts. No canonical edits.")}
      <div class="phase">Route and repair</div>
      ${protocolStep("Coordinator routes", "Clean goes to verify, mechanical work to Luna fix, narrow safety conflicts only to Sol.")}
      ${protocolStep("Serialized APPLY", "After authorization, make the smallest target-specific repair and recheck the fingerprint.")}
      ${protocolStep("Enrich and validate", "Recompute Ingredient Intelligence, run target checks, then rerun repair to prove idempotency.")}
      ${protocolStep("Coordinator closes", "Only the coordinator writes canonical audit artifacts and the terminal ledger status.")}
    </div></section>
    <section class="panel"><div class="panel-head"><h2>Open worker artifacts</h2><span>${state.runningJobCount} running &middot; ${state.activeJobCount} nonterminal across ${state.manifests} runs</span></div><div class="table-wrap"><table><thead><tr><th>Restaurant / run</th><th>Status</th><th>Flow</th><th>Run updated</th></tr></thead><tbody>${activeJobs}</tbody></table></div></section>
    <section class="panel"><div class="panel-head"><h2>Recent ledger activity</h2><span>Ledger modified ${formatWhen(state.ledgerUpdatedAt)}</span></div><div class="table-wrap"><table><thead><tr><th>Restaurant</th><th>Status</th><th>Updated</th><th>Baseline items</th></tr></thead><tbody>${rows}</tbody></table></div></section>
  </div><aside>
    <section class="panel"><h2>Ledger status</h2>${statusBars}</section>
    <section class="panel"><div class="panel-head"><h2>Next queue</h2><span>Drain exceptions first</span></div><ol class="queue">${queue}</ol></section>
  </aside></div>
  <footer>Generated ${formatWhen(state.generatedAt)} from data/restaurant-verification/ledger.jsonl and worker-runs/*/manifest.json. Median historical claimed-to-completed time: ${Number.isFinite(state.pace.medianMinutes) ? `${state.pace.medianMinutes.toFixed(0)} minutes` : "unavailable"}.</footer>
</main>
</body>
</html>`;
}

async function readManifests(workerRoot) {
  let entries;
  try {
    entries = await readdir(workerRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const manifests = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      try {
        return JSON.parse(await readFile(path.join(workerRoot, entry.name, "manifest.json"), "utf8"));
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw new Error(`Invalid worker manifest ${entry.name}: ${error.message}`);
      }
    }));
  return manifests.filter(Boolean);
}

function protocolStep(title, description) {
  return `<div class="step"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span></div>`;
}

function statusPill(status) {
  const className = status === "codex_verified" ? "good" :
    ["discrepancy_found", "blocked_unverifiable", "luna_failed", "sol_failed"].includes(status) ? "bad" :
      ["repair_in_progress", "recheck_required", "awaiting_coordinator", "awaiting_sol"].includes(status) ? "warn" : "";
  return `<span class="pill ${className}">${escapeHtml(status ?? "unknown")}</span>`;
}

function median(values) {
  if (!values.length) return Number.NaN;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function formatEta(hours) {
  if (!Number.isFinite(hours)) return "No live pace";
  if (hours < 48) return `${hours.toFixed(1)} hours`;
  return `${(hours / 24).toFixed(1)} days`;
}

function formatWhen(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "unknown";
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function formatInteger(value) {
  return Number(value).toLocaleString("en-US");
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseArgs(argv) {
  const options = { root: defaultRoot, output: defaultOutput, port: 4178, refreshSeconds: 3, serve: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--serve") options.serve = true;
    else if (argument === "--root") options.root = path.resolve(argv[++index]);
    else if (argument === "--output") options.output = path.resolve(argv[++index]);
    else if (argument === "--port") options.port = Number(argv[++index]);
    else if (argument === "--refresh-seconds") options.refreshSeconds = Number(argv[++index]);
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: node scripts/restaurant-verification-dashboard.mjs [--serve] [--port 4178] [--refresh-seconds 3] [--root PATH] [--output PATH]");
    return;
  }
  if (options.serve) {
    const server = createServer(async (request, response) => {
      try {
        if (request.url === "/health") {
          response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
          response.end(JSON.stringify({ ok: true, generatedAt: new Date().toISOString() }));
          return;
        }
        const state = await readDashboardState({ root: options.root });
        const html = renderDashboard(state, { refreshSeconds: options.refreshSeconds });
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, max-age=0" });
        response.end(html);
      } catch (error) {
        response.writeHead(500, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
        response.end(error.stack ?? error.message);
      }
    });
    server.listen(options.port, "127.0.0.1", () => {
      console.log(`SafePlate verification dashboard: http://127.0.0.1:${options.port}/`);
    });
    return;
  }
  const state = await readDashboardState({ root: options.root });
  await writeFile(options.output, renderDashboard(state, { refreshSeconds: options.refreshSeconds }), "utf8");
  console.log(options.output);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
